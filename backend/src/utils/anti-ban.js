const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Parses a Spintax string like "{Hi|Hello|Hey} there! How are {you|things}?"
 */
function parseSpintax(text) {
    if (!text) return "";
    const spintaxRegex = /\{([^{}]*)\}/g;
    return text.replace(spintaxRegex, (match, contents) => {
        const choices = contents.split('|');
        return choices[Math.floor(Math.random() * choices.length)];
    });
}

function injectVariables(text, params) {
    let newText = text;
    for (const [key, value] of Object.entries(params)) {
        const varRegex = new RegExp(`\\{\\{${key}\\}\\}`, 'gi');
        newText = newText.replace(varRegex, value);
    }
    return newText;
}

async function simulateHumanDelay(minSeconds = 10, maxSeconds = 35) {
    const delayMs = Math.floor(Math.random() * (maxSeconds - minSeconds + 1) + minSeconds) * 1000;
    console.log(`[Anti-Ban] Simulating human delay for ${delayMs / 1000}s...`);
    return new Promise(resolve => setTimeout(resolve, delayMs));
}

async function simulateTyping(sock, jid, textContent) {
    const typingTimeMs = Math.min(Math.max((textContent.length / 4) * 1000, 2000), 8000); 
    console.log(`[Anti-Ban] Simulating typing to ${jid} for ${typingTimeMs / 1000}s...`);
    if(sock && sock.sendPresenceUpdate) {
        try {
            await sock.sendPresenceUpdate('composing', jid);
            await new Promise(resolve => setTimeout(resolve, typingTimeMs));
            await sock.sendPresenceUpdate('paused', jid);
        } catch (e) {
            console.warn(`[Anti-Ban] Typing simulation failed for ${jid}:`, e.message);
        }
    }
}

/**
 * Integrates Gemini 1.5 Flash API to generate 5-10 phrase variations.
 * Ensures strict evasion of signature-based spam detection.
 */
async function generateLlmVariations(baseTemplate, variationCount = 5) {
    console.log(`[AI-Mutator] Contacting Gemini API to generate ${variationCount} phrase variants...`);
    
    if (!process.env.GEMINI_API_KEY) {
        console.warn('[AI-Mutator] GEMINI_API_KEY is missing. Falling back to base template.');
        throw new Error("GEMINI_API_KEY is missing from environment variables.");
    }

    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

        const prompt = `
        You are a highly professional sales copywriter. I need ${variationCount} slightly different 
        variations of the following WhatsApp message template. Do not change any {{Variables}} 
        like {{Name}}. Keep the tone identical, but vary the phrasing and word choice.
        Output ONLY a valid JSON array of strings containing the variations, nothing else. 
        
        Template: "${baseTemplate}"
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        
        const variations = JSON.parse(text);
        if (Array.isArray(variations) && variations.length > 0) {
            console.log(`[AI-Mutator] Successfully compiled ${variations.length} unique LLM variants.`);
            return variations;
        } else {
            throw new Error("API returned invalid JSON structure.");
        }
    } catch (err) {
        console.error('[AI-Mutator] Gemini API failed:', err.message);
        throw new Error(`AI Mutation Error: ${err.message}`);
    }
}

/**
 * Validates whether the current system time falls within the configured "Smart Window"
 * e.g., 09:00 - 18:00. Puts campaign job on hold if outside.
 */
function isWithinSmartWindow(activeStartHour = 9, activeEndHour = 18) {
    const currentHour = new Date().getHours();
    
    let isActive = false;
    if (activeStartHour <= activeEndHour) {
        isActive = currentHour >= activeStartHour && currentHour < activeEndHour;
    } else {
        isActive = currentHour >= activeStartHour || currentHour < activeEndHour;
    }
    
    if (!isActive) {
        console.warn(`[Scheduler] Currently outside Smart Window (${activeStartHour}:00 - ${activeEndHour}:00). Pausing operation.`);
    }
    return isActive;
}

/**
 * Hard Fail-Safe Handler for 401 (Unauthorised) and 429 (Rate Limit).
 * Kills queues and triggers an alert via Socket.io.
 */
function handleProtocolError(statusCode, io) {
    if (statusCode === 401 || statusCode === 429) {
        console.error(`[FAIL-SAFE TRIGGERED] Protocol responded with Error ${statusCode}.`);
        console.error(`[FAIL-SAFE] HALTING ALL ACTIVE BATCH QUEUES IMMEDIATELY.`);
        
        if (io) {
            io.emit('campaign_status', { 
                status: 'CRITICAL HALT', 
                message: `Protocol Error ${statusCode}. Safety limits hit.` 
            });
            io.emit('protocol_error', { code: statusCode });
        }
        return true; 
    }
    return false;
}

module.exports = {
    parseSpintax,
    injectVariables,
    simulateHumanDelay,
    simulateTyping,
    generateLlmVariations,
    isWithinSmartWindow,
    handleProtocolError
};
