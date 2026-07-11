require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const { GoogleGenerativeAI } = require('@google/generative-ai');

// Import utilities and scrapers
const { scrapeGMapsLeads } = require('./src/scrapers/gmaps');
const { parseSpintax, injectVariables, simulateHumanDelay, simulateTyping, generateLlmVariations, isWithinSmartWindow, handleProtocolError } = require('./src/utils/anti-ban');
const fs = require('fs');
const path = require('path');
const { initLicenseGuard, verifyLicense, getLockdownState, setLockdownState } = require('./src/middleware/licenseGuard');

// Global cache for contacts emitted by Baileys
const CONTACTS_FILE = path.join(__dirname, 'data', 'contacts.json');
let phoneContacts = {};
try {
    if (fs.existsSync(CONTACTS_FILE)) {
        phoneContacts = JSON.parse(fs.readFileSync(CONTACTS_FILE, 'utf8'));
        console.log(`[System] Loaded ${Object.keys(phoneContacts).length} contacts from persistent storage.`);
    }
} catch (e) {
    console.error('[System] Failed to parse contacts.json:', e.message);
}

function persistContacts() {
    try {
        fs.writeFileSync(CONTACTS_FILE, JSON.stringify(phoneContacts, null, 2));
    } catch (e) {
        console.error('[System] Error saving contacts.json:', e.message);
    }
}

const LEADS_FILE = path.join(__dirname, 'data', 'leads.json');
if (!fs.existsSync(path.dirname(LEADS_FILE))) {
    fs.mkdirSync(path.dirname(LEADS_FILE), { recursive: true });
}

let globalRecentMessages = [];

const app = express();
app.use(cors({
    origin: ['http://localhost:5173', 'http://127.0.0.1:5173']
}));
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { 
        origin: ['http://localhost:5173', 'http://127.0.0.1:5173'], 
        methods: ['GET', 'POST'],
        credentials: true
    }
});

let sock;
let isConnected = false;
let currentQR = null;

// Global State
let globalLeads = [];
try {
    if (fs.existsSync(LEADS_FILE)) {
        globalLeads = JSON.parse(fs.readFileSync(LEADS_FILE, 'utf8'));
        console.log(`[System] Loaded ${globalLeads.length} leads from persistent storage.`);
    }
} catch (e) {
    console.error('[System] Failed to parse leads.json:', e.message);
}

function persistLeads() {
    try {
        fs.writeFileSync(LEADS_FILE, JSON.stringify(globalLeads, null, 2));
    } catch (e) {
        console.error('[System] Error saving leads.json:', e.message);
    }
}

// Background auto-save for leads
setInterval(persistLeads, 15000);
setInterval(persistContacts, 60000);

let currentCampaign = { active: false, total: 0, sent: 0, status: 'Idle', details: '' };
let aiChatSession = null;
let autoPilotEnabled = false;
const autoPilotRateLimits = {};
let isScraping = false;

// Custom Logger to send logs to Frontend
function logToServerAndUI(level, message) {
    const logStr = `[${level.toUpperCase()}] ${message}`;
    if (level === 'error') console.error(logStr);
    else console.log(logStr);
    io.emit('backend_log', { time: new Date().toLocaleTimeString(), level, message: logStr });
}

// ----------------------------------------------------
// WhatsApp Baileys Initialization
// ----------------------------------------------------
async function connectToWhatsApp() {
    if (getLockdownState()) return;
    try {
        const { state, saveCreds } = await useMultiFileAuthState('./auth_info_baileys');
        console.log('[System] Baileys Auth Loaded');

        sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            printQRInTerminal: true,
        });

        sock.ev.on('connection.update', (update) => {
            const { connection, lastDisconnect, qr } = update;
            
            if (qr) {
                currentQR = qr;
                io.emit('wa_status', { connected: false, message: 'QR Code requires scanning' });
                io.emit('qr', qr);
            }

            if (connection === 'close') {
                const statusCode = lastDisconnect?.error?.output?.statusCode;
                const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
                
                isConnected = false;
                currentQR = null;
                io.emit('wa_status', { connected: false, message: 'Disconnected' });
                
                if (handleProtocolError(statusCode, io)) {
                    return;
                }
                if (shouldReconnect) {
                    setTimeout(connectToWhatsApp, 5000);
                }
            } else if (connection === 'open') {
                isConnected = true;
                currentQR = null;
                io.emit('wa_status', { connected: true, message: 'Active & Secure' });
            }
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('contacts.upsert', (contacts) => {
            for (const contact of contacts) {
                phoneContacts[contact.id] = contact;
            }
            persistContacts();
        });

        sock.ev.on('contacts.update', (updates) => {
            for (const update of updates) {
                if (phoneContacts[update.id]) {
                    Object.assign(phoneContacts[update.id], update);
                } else {
                    phoneContacts[update.id] = update;
                }
            }
            persistContacts();
        });

        sock.ev.on('messages.upsert', async (m) => {
            try {
                const msg = m.messages[0];
                if (!msg.message || msg.key.fromMe) return;

                if (msg.key.remoteJid === 'status@broadcast' || msg.key.remoteJid.endsWith('@g.us')) return;

                const rawSender = msg.key.remoteJid.split('@')[0];
                const sender = rawSender.split(':')[0];
                let textContent = msg.message.conversation || 
                                    msg.message.extendedTextMessage?.text || 
                                    '';
                                    
                if (msg.message.pollCreationMessage) {
                    textContent = "[Poll Created]: " + msg.message.pollCreationMessage.name;
                } else if (msg.message.pollUpdateMessage) {
                    textContent = "[Poll Vote Updated by user]";
                }

                if (!textContent) return;

                globalRecentMessages.push({
                    sender: sender,
                    name: phoneContacts[`${sender}@s.whatsapp.net`]?.name || phoneContacts[`${sender}@s.whatsapp.net`]?.notify || 'Unknown',
                    text: textContent,
                    timestamp: new Date().toISOString()
                });
                if (globalRecentMessages.length > 50) globalRecentMessages.shift();

                const lower = textContent.toLowerCase();
                const posWords = ['price', 'details', 'interested', 'catalog', 'yes', 'buy', 'how much'];
                const negWords = ['no', 'stop', 'not interested', 'unsubscribe', 'don\'t message'];
                
                let sentiment = 'neutral';
                if (posWords.some(w => lower.includes(w))) sentiment = 'positive';
                else if (negWords.some(w => lower.includes(w))) sentiment = 'negative';

                io.emit('message_received', {
                    id: msg.key.id,
                    sender: sender, 
                    number: `+${sender}`,
                    text: textContent,
                    sentiment: sentiment,
                    status: 'new'
                });
                
                if (autoPilotEnabled && process.env.GEMINI_API_KEY && sentiment !== 'negative') {
                    const now = Date.now();
                    if (autoPilotRateLimits[sender] && now - autoPilotRateLimits[sender] < 30000) {
                        console.log(`[Auto-Pilot] Rate limit hit for ${sender}. Skipping.`);
                        return;
                    }
                    autoPilotRateLimits[sender] = now;
                    
                    try {
                        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
                        const prompt = `You are VeloReach AI, a professional WhatsApp sales assistant. Reply concisely to this customer message: "${textContent}"`;
                        const result = await model.generateContent(prompt);
                        const reply = result.response.text();
                        await simulateTyping(sock, msg.key.remoteJid, reply);
                        await sock.sendMessage(msg.key.remoteJid, { text: reply });
                        io.emit('message_received', {
                            id: `ai_${Date.now()}`,
                            sender: 'VeloReach AI',
                            number: 'Auto-Pilot',
                            text: reply,
                            sentiment: 'neutral',
                            status: 'replied'
                        });
                    } catch (e) {
                        console.error('[Auto-Pilot Error]', e.message);
                    }
                }
            } catch (err) {
                console.error('[Inbox Error]', err.message);
            }
        });

        sock.ev.on('messages.update', (updates) => {
            for (const update of updates) {
                if (update.update.status === 3) {
                    io.emit('message_receipt', { status: 'delivered' });
                } else if (update.update.status === 4) {
                    io.emit('message_receipt', { status: 'read' });
                }
            }
        });
    } catch (err) {
        console.error('[Baileys Error]', err.message);
    }
}

const initialLicenseCheck = verifyLicense();
if (!initialLicenseCheck.isValid) {
    console.log(`[Security] System Lockdown Triggered: ${initialLicenseCheck.reason}`);
} else {
    connectToWhatsApp();
}

initLicenseGuard(io);

setInterval(() => {
    io.emit('heartbeat', { time: Date.now() });
    process.stdout.write('[Heartbeat] Socket.io ping sent.\r');
}, 15000);

// ----------------------------------------------------
// Socket.io Endpoints
// ----------------------------------------------------
io.on('connection', (socket) => {
    if (getLockdownState()) {
        const status = verifyLicense();
        socket.emit(status.reason || 'license_missing');
    }

    socket.on('submit_license', (keyString) => {
        try {
            fs.writeFileSync(path.join(__dirname, 'data', 'license.key'), keyString);
            const check = verifyLicense();
            if (check.isValid) {
                setLockdownState(false);
                socket.emit('license_accepted');
                connectToWhatsApp();
            } else {
                socket.emit('toast_error', 'Invalid or Expired License Key.');
            }
        } catch(e) {
            socket.emit('toast_error', 'Failed to install license.');
        }
    });

    socket.emit('wa_status', { connected: isConnected, message: isConnected ? 'Active & Secure' : (currentQR ? 'QR Code requires scanning' : 'Waiting for connection') });
    if (currentQR) socket.emit('qr', currentQR);
    socket.emit('sync_leads', globalLeads);
    socket.emit('campaign_state', currentCampaign);

    socket.on('manual_lead_entry', (data) => {
        const { name, contact, category } = data;
        const cleanContact = contact ? contact.replace(/[^\d+]/g, '') : '';
        
        if (cleanContact.length >= 7) {
            const lead = {
                id: `manual_${Date.now()}`,
                name: name,
                contact: cleanContact,
                source: 'Manual Entry',
                status: 'Verified',
                tags: category ? [category] : []
            };
            globalLeads.push(lead);
            io.emit('new_lead', lead);
        } else {
            socket.emit('toast_error', 'Invalid phone number format.');
        }
    });
    
    socket.on('tag_leads', (data) => {
        const { leadIds, tag } = data;
        globalLeads.forEach(l => {
            if (leadIds.includes(l.id)) {
                if (!l.tags) l.tags = [];
                if (!l.tags.includes(tag)) l.tags.push(tag);
            }
        });
        io.emit('sync_leads', globalLeads);
    });

    socket.on('delete_leads', (data) => {
        const { leadIds } = data;
        globalLeads = globalLeads.filter(l => !leadIds.includes(l.id));
        io.emit('sync_leads', globalLeads);
    });

    socket.on('set_auto_pilot', (enabled) => {
        autoPilotEnabled = enabled;
        console.log(`[System] Auto-Pilot set to ${enabled}`);
    });

    socket.on('logout_whatsapp', async () => {
        logToServerAndUI('info', 'User requested WhatsApp logout. Clearing session...');
        try {
            if (sock) {
                await sock.logout('User explicitly logged out');
            }
        } catch (err) {
            console.error('[Logout Error]', err.message);
        }
        
        isConnected = false;
        currentQR = null;
        
        // Wait for Baileys to release file locks before deleting (2 seconds)
        setTimeout(() => {
            try {
                const authDir = path.join(__dirname, 'auth_info_baileys');
                if (fs.existsSync(authDir)) {
                    fs.rmSync(authDir, { recursive: true, force: true });
                }
            } catch (fileErr) {
                console.error('[File Deletion Error]', fileErr.message);
            }
            
            io.emit('wa_status', { connected: false, message: 'Logged out. Generating fresh QR...' });
            
            // Re-initialize to fetch new QR
            setTimeout(connectToWhatsApp, 2000);
        }, 2000);
    });

    socket.on('start_scraper', async (data) => {
        if (getLockdownState()) return socket.emit('toast_error', 'System Locked: Valid License Required.');
        if (isScraping) return socket.emit('toast_error', 'A scraper job is already running. Please wait.');
        isScraping = true;
        
        const { source, keyword, location } = data;
        try {
            if (source === 'G-Maps') {
                await scrapeGMapsLeads(keyword, location, io, globalLeads);
            } else if (source === 'Group Grabber') {
                if (!isConnected) return socket.emit('toast_error', 'WhatsApp must be connected to pull groups.');
                
                const participantGroups = await sock.groupFetchAllParticipating();
                let count = 0;
                for (const jid in participantGroups) {
                    const group = participantGroups[jid];
                    for (const participant of group.participants) {
                        if (!/^[1-9]\d{1,14}@s\.whatsapp\.net$/.test(participant.id)) continue;
                        
                        const rawId = participant.id.split('@')[0];
                        const contactId = rawId.split(':')[0];
                        
                        const cachedContact = phoneContacts[participant.id];
                        const name = cachedContact?.notify || cachedContact?.verifiedName || contactId;
                        
                        const lead = {
                            id: `group_${Date.now()}_${contactId}`,
                            name: name,
                            contact: contactId,
                            source: 'Group Grabber',
                            groupSource: group.subject,
                            status: 'Scraped',
                            tags: [group.subject]
                        };
                        if (!globalLeads.find(l => l.contact === lead.contact)) {
                            globalLeads.push(lead);
                            io.emit('new_lead', lead);
                            count++;
                        }
                    }
                }
                socket.emit('scraper_done', { count: count });
            } else if (source === 'Contact Grabber') {
                if (!isConnected) return socket.emit('toast_error', 'WhatsApp must be connected to pull contacts.');
                
                let count = 0;
                for (const jid in phoneContacts) {
                    const contact = phoneContacts[jid];
                    if (jid.endsWith('@g.us') || jid.endsWith('@broadcast') || jid === sock.user?.id) continue;
                    
                    const rawId = jid.split('@')[0];
                    const contactId = rawId.split(':')[0];
                    if (contactId.length > 15 || !/^\d+$/.test(contactId)) continue;
                    
                    const name = contact.name || contact.notify || contact.verifiedName;
                    if (!name) continue;

                    const lead = {
                        id: `contact_${Date.now()}_${contactId}`,
                        name: name,
                        contact: contactId,
                        source: 'Phone Contacts',
                        status: 'Scraped',
                        tags: ['Personal Contact']
                    };
                    
                    if (!globalLeads.find(l => l.contact === lead.contact)) {
                        globalLeads.push(lead);
                        io.emit('new_lead', lead);
                        count++;
                    }
                }
                socket.emit('scraper_done', { count: count });
            }
        } catch (e) {
            socket.emit('toast_error', `Scraper Failed: ${e.message}`);
            socket.emit('scraper_error', { message: e.message });
        } finally {
            isScraping = false;
        }
    });

    socket.on('request_lead_sync', () => {
        socket.emit('sync_leads', globalLeads);
    });
    
    socket.on('stop_campaign', () => {
        if (currentCampaign.active) {
            currentCampaign.active = false;
            currentCampaign.status = 'Stopped by User';
            currentCampaign.details = 'Campaign halted mid-queue.';
            io.emit('campaign_state', currentCampaign);
        }
    });

    // Persistent Chat Session for Gemini Assistant
    socket.on('chat_ai', async (message) => {
        if (getLockdownState()) return socket.emit('toast_error', 'System Locked: Valid License Required.');
        if (!process.env.GEMINI_API_KEY) {
            return socket.emit('toast_error', "GEMINI_API_KEY is missing from the .env file.");
        }
        try {
            if (!aiChatSession) {
                const tools = [{
                    functionDeclarations: [
                        { name: "get_whatsapp_contacts", description: "Get a list of all synced WhatsApp contacts, including their names and numbers." },
                        { name: "get_holding_pen_leads", description: "Get a list of all extracted leads in the Holding Pen." },
                        { name: "get_recent_messages", description: "Get the latest incoming WhatsApp messages, including any poll updates." }
                    ]
                }];
                const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash", tools: tools });
                aiChatSession = model.startChat({
                    history: [
                        { role: "user", parts: [{ text: "You are VeloReach AI, an autonomous WhatsApp marketing expert. You have tools to read interface features (contacts, leads, messages, polls). Use them to help the user. Provide concise, strategic responses." }] },
                        { role: "model", parts: [{ text: "Acknowledged. I am ready to assist with VeloReach strategy and data access." }] }
                    ]
                });
            }
            let result = await aiChatSession.sendMessage(message);
            
            const calls = result.response.functionCalls ? result.response.functionCalls() : null;
            if (calls && calls.length > 0) {
                const call = calls[0];
                let apiResponse = {};
                
                if (call.name === "get_whatsapp_contacts") {
                    apiResponse = { contacts: Object.values(phoneContacts).map(c => ({ number: c.id.split('@')[0], name: c.name || c.notify || 'Unknown' })).slice(0, 100) };
                } else if (call.name === "get_holding_pen_leads") {
                    apiResponse = { leads: globalLeads };
                } else if (call.name === "get_recent_messages") {
                    apiResponse = { messages: globalRecentMessages };
                }
                
                result = await aiChatSession.sendMessage([{
                    functionResponse: {
                        name: call.name,
                        response: apiResponse
                    }
                }]);
            }
            
            socket.emit('ai_response', result.response.text());
        } catch (e) {
            socket.emit('toast_error', `AI Assistant Error: ${e.message}`);
        }
    });

    // Sandbox Test for Mutations
    socket.on('test_mutations', async (template) => {
        try {
            const variants = await generateLlmVariations(template, 3);
            socket.emit('mutation_results', variants);
        } catch (e) {
            socket.emit('toast_error', `Mutation Sandbox Failed: ${e.message}`);
        }
    });

    socket.on('launch_campaign', async (data) => {
        if (getLockdownState()) return socket.emit('toast_error', 'System Locked: Valid License Required.');
        const { leads, template, useAi, attachment, batchSize, pauseMinutes, startHour, endHour } = data;
        
        if (!isConnected) {
            return socket.emit('toast_error', 'WhatsApp protocol is not active.');
        }
        if (currentCampaign.active) return;

        currentCampaign = { active: true, total: leads.length, sent: 0, status: 'Initializing...', details: '' };
        io.emit('campaign_state', currentCampaign);

        let baseVariants = [template];

        if (useAi) {
            try {
                currentCampaign.details = 'Generating AI variations...';
                io.emit('campaign_state', currentCampaign);
                baseVariants = await generateLlmVariations(template, 5);
            } catch (err) {
                currentCampaign.active = false;
                currentCampaign.status = 'AI Failure';
                currentCampaign.details = 'Campaign halted due to AI constraint.';
                io.emit('campaign_state', currentCampaign);
                socket.emit('toast_error', `Campaign Blocked: ${err.message}`);
                return;
            }
        }

        currentCampaign.status = 'Running';
        io.emit('campaign_state', currentCampaign);

        let sentCount = 0;
        for (let i = 0; i < leads.length; i++) {
            if (!currentCampaign.active) break; 

            if (!isWithinSmartWindow(startHour, endHour)) {
                currentCampaign.active = false;
                currentCampaign.status = 'Paused: Outside Smart Window';
                currentCampaign.details = `Halted at ${sentCount} / ${leads.length}`;
                io.emit('campaign_state', currentCampaign);
                return;
            }

            const target = leads[i];
            const jid = `${target.contact.replace(/\+/g, '')}@s.whatsapp.net`;
            
            const variant = baseVariants[i % baseVariants.length];
            const parsedSpintax = parseSpintax(variant);
            const finalMessage = injectVariables(parsedSpintax, { Name: target.name || 'Friend' });

            let msgPayload = { text: finalMessage };
            let preTextPayload = null;
            
            if (attachment && attachment.type !== 'none' && attachment.payload) {
                try {
                    if (attachment.type === 'image' || attachment.type === 'pdf') {
                        const buffer = Buffer.from(attachment.payload.data.split(',')[1], 'base64');
                        if (attachment.type === 'image') {
                            msgPayload = { image: buffer, caption: finalMessage };
                        } else {
                            msgPayload = { document: buffer, mimetype: attachment.payload.mime || 'application/pdf', fileName: attachment.payload.name, caption: finalMessage };
                        }
                    } else if (attachment.type === 'poll') {
                        const options = attachment.payload.options ? attachment.payload.options.split(',').map(o => o.trim()).filter(Boolean) : ['Yes', 'No'];
                        msgPayload = {
                            poll: {
                                name: attachment.payload.name || finalMessage,
                                values: options.length > 0 ? options : ['Yes', 'No'],
                                selectableCount: 1
                            }
                        };
                        preTextPayload = { text: finalMessage };
                    } else if (attachment.type === 'location') {
                        msgPayload = {
                            location: {
                                degreesLatitude: parseFloat(attachment.payload.lat || 0),
                                degreesLongitude: parseFloat(attachment.payload.lng || 0)
                            }
                        };
                        preTextPayload = { text: finalMessage };
                    } else if (attachment.type === 'contact') {
                        const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${attachment.payload.name || 'Contact'}\nTEL;type=CELL;type=VOICE;waid=${attachment.payload.phone}:${attachment.payload.phone}\nEND:VCARD`;
                        msgPayload = {
                            contacts: {
                                displayName: attachment.payload.name || 'Contact',
                                contacts: [{ vcard }]
                            }
                        };
                        preTextPayload = { text: finalMessage };
                    }
                } catch (e) {
                    console.error('[Attachment Error]', e.message);
                }
            }

            try {
                await simulateTyping(sock, jid, finalMessage);
                if (!currentCampaign.active) break; 
                
                if (preTextPayload) {
                    await sock.sendMessage(jid, preTextPayload);
                    await simulateHumanDelay(2, 4);
                }
                
                await sock.sendMessage(jid, msgPayload);
                
                sentCount++;
                currentCampaign.sent = sentCount;
                currentCampaign.details = `Dispatched to ${target.name || target.contact}`;
                io.emit('campaign_state', currentCampaign);
                
                if (sentCount % batchSize === 0 && i !== leads.length - 1) {
                    const pauseMs = pauseMinutes * 60 * 1000;
                    currentCampaign.status = `Batch sleeping for ${pauseMinutes}m`;
                    io.emit('campaign_state', currentCampaign);
                    
                    let passed = 0;
                    while (passed < pauseMs && currentCampaign.active) {
                        await new Promise(r => setTimeout(r, 1000));
                        passed += 1000;
                    }
                    if (!currentCampaign.active) break;
                    
                    currentCampaign.status = 'Running';
                    io.emit('campaign_state', currentCampaign);
                } else if (i !== leads.length - 1) {
                    await simulateHumanDelay(10, 35);
                }

            } catch (err) {
                logToServerAndUI('error', `[Campaign] Error dispatching to ${target.contact}: ${err.message}`);
                socket.emit('toast_error', `Failed to message ${target.contact}: ${err.message}`);
                if (!currentCampaign.active) break;
            }
        }
        
        if (currentCampaign.active) {
            currentCampaign.active = false;
            currentCampaign.status = 'Completed';
            currentCampaign.details = `Successfully sent ${currentCampaign.sent} messages.`;
            io.emit('campaign_state', currentCampaign);
        }
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, '127.0.0.1', () => {
    console.log(`[System] Socket.io Server Active on 127.0.0.1:${PORT}`);
});
