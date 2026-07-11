import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';
import ReactMarkdown from 'react-markdown';
import { 
  Send, 
  Users, 
  ShieldCheck, 
  Settings, 
  Database,
  ArrowRight,
  Clock,
  Sparkles,
  AlertTriangle,
  Activity,
  Inbox,
  QrCode,
  X,
  PlusCircle,
  Download,
  RefreshCw,
  StopCircle,
  MessageSquare,
  Tag,
  HelpCircle,
  TestTube,
  Terminal,
  LogOut
} from 'lucide-react';

const SOCKET_URL = 'http://localhost:5000';

// Global Toast Component
const Toast = ({ message, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 5000);
        return () => clearTimeout(timer);
    }, [message, onClose]);
    return (
        <div className="toast-notification animated fadeIn">
            <AlertTriangle size={18} />
            <span>{message}</span>
            <X size={16} style={{ cursor: 'pointer', marginLeft: 'auto' }} onClick={onClose} />
        </div>
    );
};

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="glass-panel" style={{ textAlign: 'center', padding: '48px', color: '#D93025', marginTop: '24px' }}>
          <AlertTriangle size={48} style={{ marginBottom: '16px' }} />
          <h2>Component Error Blocked</h2>
          <p style={{ color: 'var(--onyx)', marginTop: '8px' }}>We prevented a fatal UI crash. Error: {this.state.error && this.state.error.message}</p>
          <button className="btn-secondary" style={{ marginTop: '24px' }} onClick={() => this.setState({ hasError: false })}>Recover UI Session</button>
        </div>
      );
    }
    return this.props.children; 
  }
}

function App() {
  const [activeTab, setActiveTab] = useState('extractors');
  const [socket, setSocket] = useState(null);
  const [toastMessage, setToastMessage] = useState(null);
  
  // App State
  const [isLocked, setIsLocked] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [leads, setLeads] = useState([]);
  const [selectedLeads, setSelectedLeads] = useState(new Set());
  const [campaignTargets, setCampaignTargets] = useState([]);
  const [messages, setMessages] = useState([]);
  
  const [isScraping, setIsScraping] = useState(false);
  const [varyMessage, setVaryMessage] = useState(false);
  const [campaignState, setCampaignState] = useState({ active: false, total: 0, sent: 0, status: 'Idle', details: '' });
  
  const [protocolStatus, setProtocolStatus] = useState({ connected: false, message: 'Connecting...' });
  const [socketHeartbeat, setSocketHeartbeat] = useState('Connecting...');
  const [globalFailsafe, setGlobalFailsafe] = useState(false);
  const [qrCode, setQrCode] = useState(null);
  
  const [showQrModal, setShowQrModal] = useState(false);
  const [showManualModal, setShowManualModal] = useState(false);
  const [manualForm, setManualForm] = useState({ name: '', contact: '', category: '' });
  const [tagInput, setTagInput] = useState('');

  // Safety & Campaign Control States
  const [templateText, setTemplateText] = useState("Hello {{Name}}, we noticed your business. Would you be interested in our new fabric catalog?");
  const [activeWindow, setActiveWindow] = useState({ start: '09:00', end: '18:00' });
  const [batchSettings, setBatchSettings] = useState({ engage: 25, pause: 30 });
  const [mutationPreviews, setMutationPreviews] = useState([]);
  const [isMutating, setIsMutating] = useState(false);
  const [attachment, setAttachment] = useState({ type: 'none', payload: null });

  // AI Chat State
  const [aiHistory, setAiHistory] = useState([{ sender: 'ai', text: 'Hello! I am VeloReach AI, powered by Gemini 1.5 Flash. How can I help you optimize your campaign?' }]);
  const [aiInput, setAiInput] = useState('');
  const [isAiTyping, setIsAiTyping] = useState(false);
  const [autoPilotEnabled, setAutoPilotEnabled] = useState(false);

  // Message Tracking Stats
  const [receiptStats, setReceiptStats] = useState({ delivered: 0, read: 0 });

  // System Logs
  const [systemLogs, setSystemLogs] = useState([]);
  const [showLogs, setShowLogs] = useState(false);

  // Auto-scroll ref for AI Chat
  const chatEndRef = useRef(null);
  useEffect(() => {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [aiHistory, isAiTyping]);

  // Initialize Socket Connection
  useEffect(() => {
    const newSocket = io(SOCKET_URL, {
        withCredentials: true
    });
    setSocket(newSocket);

    newSocket.on('connect', () => {
        setSocketHeartbeat('Live (Port 5000)');
    });

    newSocket.on('heartbeat', (data) => {
        setSocketHeartbeat(`Live (Last Ping: ${new Date(data.time).toLocaleTimeString()})`);
    });

    newSocket.on('wa_status', (data) => {
        setProtocolStatus(data);
        if (data.connected) {
            setQrCode(null);
            setShowQrModal(false);
        }
    });

    newSocket.on('subscription_expired', () => setIsLocked(true));
    newSocket.on('license_missing', () => setIsLocked(true));
    newSocket.on('invalid_signature', () => setIsLocked(true));
    newSocket.on('license_accepted', () => {
        setIsLocked(false);
        setToastMessage("License verified. Rebooting VeloReach Protocol.");
    });

    newSocket.on('qr', (qrString) => {
        setQrCode(qrString);
        setShowQrModal(true); // Auto-open modal on logout/new session
    });

    newSocket.on('new_lead', (lead) => {
        setLeads(prev => {
            const exists = prev.find(l => l.id === lead.id || l.contact === lead.contact);
            if (exists) return prev;
            return [...prev, lead];
        });
    });

    newSocket.on('sync_leads', (globalLeadsArray) => {
        setLeads(globalLeadsArray || []);
    });

    newSocket.on('scraper_done', (data) => {
        setIsScraping(false);
    });

    newSocket.on('scraper_error', (err) => {
        setIsScraping(false);
    });

    newSocket.on('toast_error', (msg) => {
        setToastMessage(msg);
        setIsMutating(false);
        setIsAiTyping(false);
    });

    newSocket.on('message_received', (msg) => {
        setMessages(prev => [msg, ...prev]);
    });

    newSocket.on('message_receipt', (data) => {
        setReceiptStats(prev => ({
            ...prev,
            [data.status]: prev[data.status] + 1
        }));
    });

    newSocket.on('campaign_state', (data) => {
        setCampaignState(data);
    });

    newSocket.on('backend_log', (data) => {
        setSystemLogs(prev => {
            const updated = [data, ...prev];
            return updated.slice(0, 50); // Keep last 50
        });
    });

    newSocket.on('ai_response', (text) => {
        setAiHistory(prev => [...prev, { sender: 'ai', text }]);
        setIsAiTyping(false);
    });

    newSocket.on('mutation_results', (variants) => {
        setMutationPreviews(variants || []);
        setIsMutating(false);
    });

    newSocket.on('protocol_error', (data) => {
        setGlobalFailsafe(true);
    });

    return () => newSocket.disconnect();
  }, []);

  const handleScrape = (source) => {
    if (!socket || isScraping) return;
    setIsScraping(true);
    socket.emit('start_scraper', { source, keyword: 'fabric sourcing', location: 'New York' });
    setActiveTab('dashboard'); 
  };

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!socket || !manualForm.name || !manualForm.contact) return;
    socket.emit('manual_lead_entry', manualForm);
    setManualForm({ name: '', contact: '', category: '' });
    setShowManualModal(false);
    setActiveTab('dashboard');
  };

  const handleApplyTag = () => {
      if (!socket || !tagInput || selectedLeads.size === 0) return;
      socket.emit('tag_leads', { leadIds: Array.from(selectedLeads), tag: tagInput });
      setTagInput('');
      setSelectedLeads(new Set());
  };

  const handleDeleteLeads = () => {
      if (!socket || selectedLeads.size === 0) return;
      if (window.confirm(`Are you sure you want to delete ${selectedLeads.size} leads?`)) {
          socket.emit('delete_leads', { leadIds: Array.from(selectedLeads) });
          setSelectedLeads(new Set());
      }
  };

  const handleFullSync = () => {
    if (!socket) return;
    socket.emit('request_lead_sync');
    setCampaignTargets(leads); 
  };

  const testMutations = () => {
      if (!socket || !templateText.trim()) return;
      setIsMutating(true);
      setMutationPreviews([]);
      socket.emit('test_mutations', templateText);
  };

  const downloadCSV = () => {
    if (leads.length === 0) return;
    const headers = ['Business Name', 'Contact Number', 'Source', 'Group Source', 'Status', 'Tags'];
    const csvContent = [
        headers.join(','),
        ...leads.map(l => `"${l.name}","${l.contact}","${l.source}","${l.groupSource || ''}","${l.status}","${l.tags?.join('; ')}"`)
    ].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', `veloreach_leads_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const toggleLeadSelection = (id) => {
    const newSel = new Set(selectedLeads);
    if (newSel.has(id)) newSel.delete(id);
    else newSel.add(id);
    setSelectedLeads(newSel);
  };

  const transferToCampaign = () => {
    const targets = leads.filter(l => selectedLeads.has(l.id));
    setCampaignTargets(prev => {
      const existingIds = new Set(prev.map(p => p.id));
      const additions = targets.filter(t => !existingIds.has(t.id));
      return [...prev, ...additions];
    });
    setTimeout(() => setActiveTab('bulk'), 300);
  };

  const launchCampaign = () => {
    if (!socket || campaignTargets.length === 0 || campaignState.active) return;
    const startHour = parseInt(activeWindow.start.split(':')[0], 10);
    const endHour = parseInt(activeWindow.end.split(':')[0], 10);
    socket.emit('launch_campaign', {
        leads: campaignTargets,
        template: templateText,
        useAi: varyMessage,
        attachment: attachment.type !== 'none' && attachment.payload ? attachment : null,
        batchSize: parseInt(batchSettings.engage) || 25,
        pauseMinutes: parseInt(batchSettings.pause) || 30,
        startHour: isNaN(startHour) ? 9 : startHour,
        endHour: isNaN(endHour) ? 18 : endHour
    });
  };

  const stopCampaign = () => {
      if (socket) socket.emit('stop_campaign');
  };

  const sendAiChat = (e) => {
      e.preventDefault();
      if (!aiInput.trim() || !socket) return;
      setAiHistory(prev => [...prev, { sender: 'user', text: aiInput }]);
      setIsAiTyping(true);
      socket.emit('chat_ai', aiInput);
      setAiInput('');
  };

  const toggleAutoPilot = (e) => {
      const enabled = e.target.checked;
      setAutoPilotEnabled(enabled);
      if (socket) socket.emit('set_auto_pilot', enabled);
  };

  const handleLogout = () => {
      if (!socket) return;
      if (window.confirm("Are you sure you want to log out of WhatsApp? This will clear your session and require scanning a new QR code.")) {
          socket.emit('logout_whatsapp');
      }
  };

  // --- UI Components ---
  const LeadExtractor = () => (
    <div className="glass-panel animated fadeIn">
      <div className="heading-1" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Lead Extraction Suite</div>
      <p style={{ color: 'var(--slate)', marginBottom: '2rem' }}>Harvest high-quality prospects seamlessly or enter them manually.</p>
      
      <div className="modules-grid">
        <div className="module-card glass-panel" onClick={() => !isScraping && handleScrape('G-Maps')}>
          <div className="module-icon"><Database size={24} /></div>
          <h3 style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Stealth-Puppeteer G-Maps</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--slate)' }}>Bypass rate limits; extract leads directly to queue via WebSocket.</p>
          <button className="btn-primary" style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'center' }} disabled={isScraping}>
            {isScraping ? 'Extracting via Stealth...' : 'Start Extraction'}
          </button>
        </div>
        <div className="module-card glass-panel" onClick={() => !isScraping && handleScrape('Group Grabber')}>
          <div className="module-icon"><Users size={24} /></div>
          <h3 style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Group Grabber</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--slate)' }}>Silent bulk-extraction directly from joined WhatsApp groups.</p>
          <button className="btn-primary" style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'center' }} disabled={isScraping || !protocolStatus.connected}>
            {isScraping ? 'Extracting...' : 'Start Extraction'}
          </button>
        </div>
        <div className="module-card glass-panel" onClick={() => !isScraping && handleScrape('Contact Grabber')}>
          <div className="module-icon" style={{ background: 'var(--aqua-drift-dark)' }}><Users size={24} /></div>
          <h3 style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Individual Contact Grabber</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--slate)' }}>Syncs all individually saved contacts from your WhatsApp.</p>
          <button className="btn-primary" style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'center' }} disabled={isScraping || !protocolStatus.connected}>
            {isScraping ? 'Syncing Contacts...' : 'Sync Contacts'}
          </button>
        </div>
        <div className="module-card glass-panel" onClick={() => setShowManualModal(true)}>
          <div className="module-icon" style={{ background: 'var(--onyx)' }}><PlusCircle size={24} /></div>
          <h3 style={{ marginBottom: '0.5rem', fontWeight: 600 }}>Manual Quick-Add</h3>
          <p style={{ fontSize: '0.875rem', color: 'var(--slate)' }}>Manually insert high-value contacts directly into the pipeline.</p>
          <button className="btn-secondary" style={{ marginTop: '1.5rem', width: '100%', justifyContent: 'center' }}>
            Open Form
          </button>
        </div>
      </div>
    </div>
  );

  const LeadDashboard = () => (
    <div className="glass-panel animated fadeIn dashboard-layout">
      <div className="dashboard-header">
        <div>
          <div className="heading-1" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>The Holding Pen</div>
          <p style={{ color: 'var(--slate)' }}>Live Socket stream of scraped and manually entered targets.</p>
        </div>
        <div style={{ display: 'flex', gap: '16px' }}>
          <button className="btn-export" onClick={downloadCSV} disabled={leads.length === 0}>
             <Download size={18} /> Download Leads
          </button>
          {selectedLeads.size > 0 && (
            <>
              <button className="btn-secondary animated fadeIn" style={{ borderColor: '#D93025', color: '#D93025' }} onClick={handleDeleteLeads}>
                <X size={18} /> Delete Selected
              </button>
              <button className="btn-primary animated fadeIn" onClick={transferToCampaign}>
                Transfer {selectedLeads.size} to Campaign <ArrowRight size={18} />
              </button>
            </>
          )}
        </div>
      </div>
      
      {selectedLeads.size > 0 && (
          <div className="tag-toolbar animated fadeIn">
              <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>Group Selected Leads:</span>
              <div style={{ display: 'flex', gap: '8px', marginLeft: '12px' }}>
                 <input type="text" className="form-input short-input" style={{ width: '150px', padding: '6px 12px' }} placeholder="e.g. Surat Manufacturers" value={tagInput} onChange={e => setTagInput(e.target.value)} />
                 <button className="btn-secondary" style={{ padding: '6px 16px', fontSize: '0.875rem' }} onClick={handleApplyTag}><Tag size={14}/> Apply Tag</button>
              </div>
          </div>
      )}

      <div className="table-container fade-enter">
        {leads.length === 0 ? (
          <div className="empty-state">
            <Database size={48} style={{ opacity: 0.5, marginBottom: '1rem' }} />
            <p>{isScraping ? 'Listening for live socket stream...' : 'No leads found. Use the Extractors to load the Holding Pen.'}</p>
          </div>
        ) : (
          <table className="leads-table">
            <thead>
              <tr>
                <th>
                  <input type="checkbox" 
                    onChange={(e) => {
                      if (e.target.checked) setSelectedLeads(new Set(leads.map(l => l.id)));
                      else setSelectedLeads(new Set());
                    }} 
                    checked={selectedLeads.size === leads.length && leads.length > 0} 
                  />
                </th>
                <th>Business Name</th>
                <th>Contact Number</th>
                <th>Source</th>
                <th>Group Source</th>
                <th>Tags</th>
              </tr>
            </thead>
            <tbody>
              {leads.map(lead => (
                <tr key={lead.id} className={selectedLeads.has(lead.id) ? 'selected' : 'animated fadeIn'}>
                  <td>
                    <input type="checkbox" 
                      onChange={() => toggleLeadSelection(lead.id)}
                      checked={selectedLeads.has(lead.id)}
                    />
                  </td>
                  <td style={{ fontWeight: 500 }}>{lead.name}</td>
                  <td style={{ fontFamily: 'monospace' }}>{lead.contact}</td>
                  <td><span className="badge-source">{lead.source}</span></td>
                  <td>{lead.groupSource ? <span style={{ color: 'var(--slate)', fontSize: '0.85rem', fontWeight: 500 }}>{lead.groupSource}</span> : '-'}</td>
                  <td>
                      <div className="tag-pill-container">
                          {lead.tags && lead.tags.map((t, idx) => <span key={idx} className="tag-pill">{t}</span>)}
                      </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );

  const BulkEngine = () => (
    <div className="glass-panel animated fadeIn">
      <div className="heading-1" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Campaign Engine</div>
      <p style={{ color: 'var(--slate)', marginBottom: '2rem' }}>Gemini 1.5 Flash Powered active campaigns with automated mutation.</p>
      
      <div className="bulk-grid">
        <div className="bulk-form">
          <div className="form-group">
            <label className="form-label" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Target Audience Data</span>
              <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                 <button className="btn-secondary" style={{ padding: '6px 12px', fontSize: '0.75rem', gap: '4px' }} onClick={handleFullSync}>
                    <RefreshCw size={12} /> Sync Leads
                 </button>
                 <span style={{ color: 'var(--aqua-drift-dark)' }}>{campaignTargets.length} Queue</span>
              </div>
            </label>
            <div className="target-box glass-panel-inner">
              {campaignTargets.length > 0 ? (
                 <div className="target-pill-container">
                    {campaignTargets.slice(0, 4).map(t => (
                      <span key={t.id} className="target-pill">{t.name}</span>
                    ))}
                    {campaignTargets.length > 4 && <span className="target-pill">+{campaignTargets.length - 4} more</span>}
                 </div>
              ) : (
                <div style={{ color: 'var(--slate)', fontSize: '0.875rem' }}>No targets loaded. Select from The Holding Pen or click Sync Leads.</div>
              )}
            </div>
          </div>

          <div className="form-group glass-panel-inner" style={{ marginTop: '1.5rem', padding: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
               <label className="form-label" style={{ marginBottom: 0 }}>Template Manager</label>
            </div>
            
            <textarea 
              className="form-input form-textarea" 
              value={templateText}
              onChange={(e) => setTemplateText(e.target.value)}
              disabled={campaignState.active}
            ></textarea>
            
            <div className="ai-toggle-section">
               <label className="switch">
                 <input type="checkbox" checked={varyMessage} onChange={(e) => setVaryMessage(e.target.checked)} disabled={campaignState.active} />
                 <span className="slider round"></span>
               </label>
               <div className="ai-toggle-text">
                  <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                     <Sparkles size={16} color={varyMessage ? 'var(--aqua-drift-dark)' : 'var(--slate)'} />
                     Gemini 1.5 Content Mutator
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--slate)' }}>Automatically writes 5-10 phrase variants to mask signature.</span>
               </div>
            </div>
            
            {varyMessage && (
                <div style={{ marginTop: '16px' }}>
                   <button className="btn-secondary" style={{ padding: '8px 16px', fontSize: '0.875rem' }} onClick={testMutations} disabled={isMutating}>
                       <TestTube size={16} /> {isMutating ? 'Mutating via API...' : 'Sandbox Preview Mutations'}
                   </button>
                   
                   {mutationPreviews.length > 0 && (
                       <div className="mutation-preview-box">
                           <p style={{ fontSize: '0.75rem', color: 'var(--slate)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Sandbox Results ({'{{Name}}'} = "Acme Corp")</p>
                           {mutationPreviews.map((p, i) => (
                               <div key={i} className="mutation-bubble">
                                   {p.replace(/\{\{Name\}\}/gi, 'Acme Corp')}
                               </div>
                           ))}
                       </div>
                   )}
                </div>
            )}

            <div style={{ marginTop: '1.5rem', paddingTop: '1.5rem', borderTop: '1px solid var(--gray-border)' }}>
              <label className="form-label" style={{ marginBottom: '8px' }}>Rich Media & Attachments (Optional)</label>
              <select className="form-input" value={attachment.type} onChange={e => setAttachment({ type: e.target.value, payload: null })} disabled={campaignState.active}>
                <option value="none">Text Only (No Attachment)</option>
                <option value="image">Image / Poster (JPG, PNG)</option>
                <option value="pdf">Document (PDF)</option>
                <option value="poll">Interactive Poll</option>
                <option value="location">GPS Location</option>
                <option value="contact">Contact Card (vCard)</option>
              </select>

              {attachment.type === 'image' || attachment.type === 'pdf' ? (
                 <input type="file" className="form-input" style={{ marginTop: '12px' }} accept={attachment.type === 'image' ? 'image/*' : 'application/pdf'} onChange={e => {
                     const file = e.target.files[0];
                     if(file) {
                         const reader = new FileReader();
                         reader.onload = (ev) => setAttachment({ type: attachment.type, payload: { name: file.name, data: ev.target.result, mime: file.type } });
                         reader.readAsDataURL(file);
                     }
                 }} disabled={campaignState.active} />
              ) : attachment.type === 'poll' ? (
                 <div style={{ marginTop: '12px' }}>
                     <input type="text" className="form-input" placeholder="Poll Question" onChange={e => setAttachment({ type: 'poll', payload: { ...attachment.payload, name: e.target.value } })} disabled={campaignState.active} />
                     <input type="text" className="form-input" style={{ marginTop: '8px' }} placeholder="Options (comma separated, e.g. Yes, No, Maybe)" onChange={e => setAttachment({ type: 'poll', payload: { ...attachment.payload, options: e.target.value } })} disabled={campaignState.active} />
                 </div>
              ) : attachment.type === 'location' ? (
                 <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                     <input type="number" className="form-input" placeholder="Latitude (e.g. 40.7128)" onChange={e => setAttachment({ type: 'location', payload: { ...attachment.payload, lat: e.target.value } })} disabled={campaignState.active} />
                     <input type="number" className="form-input" placeholder="Longitude (e.g. -74.0060)" onChange={e => setAttachment({ type: 'location', payload: { ...attachment.payload, lng: e.target.value } })} disabled={campaignState.active} />
                 </div>
              ) : attachment.type === 'contact' ? (
                 <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                     <input type="text" className="form-input" placeholder="Full Name" onChange={e => setAttachment({ type: 'contact', payload: { ...attachment.payload, name: e.target.value } })} disabled={campaignState.active} />
                     <input type="text" className="form-input" placeholder="Phone Number" onChange={e => setAttachment({ type: 'contact', payload: { ...attachment.payload, phone: e.target.value } })} disabled={campaignState.active} />
                 </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="bulk-sidebar">
           <div className="pre-flight glass-panel-inner">
              <ShieldCheck size={32} color={protocolStatus.connected ? "var(--aqua-drift-dark)" : "#D93025"} />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, marginBottom: '4px' }}>Status: {campaignState.status}</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--slate)', marginBottom: '8px', minHeight: '18px' }}>
                   {campaignState.details}
                </div>
                {campaignState.active && (
                   <div className="progress-bar">
                      <div className="progress-fill" style={{ width: `${(campaignState.sent / campaignState.total) * 100}%` }}></div>
                   </div>
                )}
                <div style={{ marginTop: '16px', display: 'flex', gap: '12px' }}>
                   <div style={{ flex: 1, background: '#E6F4EA', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                       <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1E8E3E' }}>{receiptStats.delivered}</div>
                       <div style={{ fontSize: '0.75rem', color: '#1E8E3E', textTransform: 'uppercase' }}>Delivered</div>
                   </div>
                   <div style={{ flex: 1, background: '#E8F0FE', padding: '8px', borderRadius: '4px', textAlign: 'center' }}>
                       <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#1A73E8' }}>{receiptStats.read}</div>
                       <div style={{ fontSize: '0.75rem', color: '#1A73E8', textTransform: 'uppercase' }}>Read</div>
                   </div>
                </div>
              </div>
           </div>
           
           {!campaignState.active ? (
               <button 
                 className="btn-primary bulk-launch-btn" 
                 onClick={launchCampaign} 
                 disabled={campaignTargets.length === 0 || !protocolStatus.connected}
               >
                 <Send size={20} /> Initialize Campaign
               </button>
           ) : (
               <button 
                 className="btn-secondary bulk-launch-btn" 
                 onClick={stopCampaign} 
                 style={{ color: '#D93025', borderColor: '#D93025' }}
               >
                 <StopCircle size={20} /> Stop Active Queue
               </button>
           )}
        </div>
      </div>
    </div>
  );

  const PriorityInbox = () => (
    <div className="glass-panel animated fadeIn">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
            <div className="heading-1" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Priority Inbox</div>
            <p style={{ color: 'var(--slate)', marginBottom: '2rem' }}>Live Socket feed categorizing pure text replies via NLP. Ignores automated Status Broadcasts.</p>
        </div>
        <div className="ai-toggle-section glass-panel-inner" style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
           <label className="switch">
             <input type="checkbox" checked={autoPilotEnabled} onChange={toggleAutoPilot} />
             <span className="slider round"></span>
           </label>
           <div className="ai-toggle-text">
              <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '6px' }}>
                 <Sparkles size={16} color={autoPilotEnabled ? 'var(--aqua-drift-dark)' : 'var(--slate)'} />
                 AI Auto-Pilot
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--slate)' }}>Automatically responds using Gemini.</span>
           </div>
        </div>
      </div>

      <div className="inbox-list">
        {messages.length === 0 ? (
           <div style={{ color: 'var(--slate)', padding: '2rem' }}>No incoming messages detected over Socket yet.</div>
        ) : messages.map((msg, index) => (
          <div key={`${msg.id}_${index}`} className={`inbox-card glass-panel-inner ${msg.sentiment === 'positive' ? 'positive-highlight' : ''} animated fadeIn`}>
            <div className="inbox-header">
               <div style={{ fontWeight: 600, fontSize: '1.125rem' }}>
                 {msg.sender} <span className="inbox-number">{msg.number}</span>
               </div>
               <div className={`sentiment-badge mode-${msg.sentiment}`}>
                 {msg.sentiment}
               </div>
            </div>
            <p style={{ margin: '1rem 0' }}>{msg.text}</p>
            {msg.sentiment === 'positive' && (
               <button className="btn-primary" style={{ padding: '8px 16px', fontSize: '0.875rem' }}>Accelerate Reply</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );

  const AiAssistant = () => (
    <div className="glass-panel animated fadeIn dashboard-layout">
      <div className="heading-1" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}><Sparkles size={28} /> Gemini AI Assistant</div>
      <p style={{ color: 'var(--slate)', marginBottom: '2rem' }}>Chat directly with VeloReach's onboard AI to formulate strategies.</p>
      
      <div className="chat-window">
          <div className="chat-history">
              {aiHistory.map((msg, idx) => (
                  <div key={idx} className={`chat-bubble ${msg.sender}`}>
                      {msg.sender === 'ai' ? <ReactMarkdown>{msg.text}</ReactMarkdown> : msg.text}
                  </div>
              ))}
              {isAiTyping && (
                  <div className="chat-bubble ai">
                      <span className="animated fadeIn" style={{ color: 'var(--slate)' }}>Gemini is typing...</span>
                  </div>
              )}
              <div ref={chatEndRef} />
          </div>
          <form className="chat-input-area" onSubmit={sendAiChat}>
              <input 
                  type="text" 
                  className="form-input" 
                  placeholder={isAiTyping ? "Awaiting response..." : "Ask Gemini for marketing advice..."} 
                  value={aiInput} 
                  onChange={e => setAiInput(e.target.value)} 
                  disabled={isAiTyping}
              />
              <button type="submit" className="btn-primary" style={{ padding: '12px', borderRadius: '50%' }} disabled={isAiTyping}>
                  <Send size={18} />
              </button>
          </form>
      </div>
    </div>
  );

  const HelpCenter = () => (
    <div className="glass-panel animated fadeIn">
      <div className="heading-1" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Help Center & Documentation</div>
      <p style={{ color: 'var(--slate)', marginBottom: '2rem' }}>User Guide for the VeloReach Automation Engine.</p>
      
      <div className="glass-panel-inner" style={{ marginBottom: '16px' }}>
          <h3 style={{ marginBottom: '8px', fontWeight: 600 }}>1. Connecting WhatsApp</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--onyx)', lineHeight: 1.6 }}>
             To link your session, ensure the Baileys Backend is running. Click "Connect WhatsApp" in the bottom-left sidebar. Scan the rendered QR Code using your phone via <strong>WhatsApp Settings &gt; Linked Devices</strong>. Once connected, your session will persist safely via the `auth_info_baileys` matrix.
          </p>
      </div>
      <div className="glass-panel-inner" style={{ marginBottom: '16px' }}>
          <h3 style={{ marginBottom: '8px', fontWeight: 600 }}>2. Utilizing Extractors</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--onyx)', lineHeight: 1.6 }}>
             The <strong>G-Maps Scraper</strong> spins up a headless Chromium instance to harvest local business numbers natively avoiding bans. The <strong>Group Grabber</strong> will iterate through your current joined WhatsApp Groups and clone all member IDs directly into the queue.
          </p>
      </div>
      <div className="glass-panel-inner" style={{ marginBottom: '16px' }}>
          <h3 style={{ marginBottom: '8px', fontWeight: 600 }}>3. Safety Policies & Anti-Ban</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--onyx)', lineHeight: 1.6 }}>
             VeloReach is protected by the <strong>Global Failsafe</strong>. Always set a conservative <strong>Batch Limit</strong> (e.g. 25 messages) accompanied by a <strong>Pause Margin</strong> (e.g. 30 mins) in the Safety tab. The engine automatically simulates human typing behavior before dispatch. Ensure the <strong>Smart Window</strong> matches your local timezone.
          </p>
      </div>
      <div className="glass-panel-inner" style={{ marginBottom: '16px' }}>
          <h3 style={{ marginBottom: '8px', fontWeight: 600 }}>4. Resolving Contact Names</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--onyx)', lineHeight: 1.6 }}>
             When extracting from groups, VeloReach will attempt to resolve the participant's identity using their <strong>Notify Name</strong> (the name they set on their WhatsApp profile) or their <strong>Saved Contact</strong> name (if you have them saved in your phone). If neither is available, it gracefully falls back to their pure phone number.
          </p>
      </div>
      <div className="glass-panel-inner" style={{ marginBottom: '16px', borderLeft: '4px solid var(--aqua-drift-dark)' }}>
          <h3 style={{ marginBottom: '8px', fontWeight: 600 }}>5. Troubleshooting (Fedora Linux)</h3>
          <p style={{ fontSize: '0.9rem', color: 'var(--onyx)', lineHeight: 1.6 }}>
             <strong>Port 5000 Conflicts:</strong> If the backend hangs on restart, the `npm start` script will automatically run a <code>kill -9 $(lsof -t -i:5000)</code> command to clear hanging Socket.io binds before rebooting.<br/><br/>
             <strong>Puppeteer Launch Errors:</strong> The Stealth Scraper relies on a host browser. If it fails, ensure Chromium is installed via your DNF package manager: <code style={{ background: 'var(--almond-sand-dark)', padding: '2px 4px', borderRadius: '4px' }}>sudo dnf install chromium</code>
          </p>
      </div>
    </div>
  );

  const AntiBanSettings = () => (
    <div className="glass-panel animated fadeIn">
      <div className="heading-1" style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>Safety & Scheduling</div>
      <p style={{ color: 'var(--slate)', marginBottom: '2rem' }}>Enterprise rules protecting the protocol engine.</p>
      
      <div className="safety-grid">
         <div className="safety-forms">
            <div className="form-group border-bottom">
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Clock size={16}/> Engine Batching</label>
              <div style={{ fontSize: '0.875rem', color: 'var(--slate)', marginBottom: '1rem' }}>Rest the engine heavily between blocks to mitigate tracking.</div>
              <div className="inline-form">
                <span>Engage</span>
                <input 
                   type="number" 
                   className="form-input short-input" 
                   value={batchSettings.engage} 
                   onChange={e => setBatchSettings({...batchSettings, engage: e.target.value})}
                />
                <span>messages, pause</span>
                <input 
                   type="number" 
                   className="form-input short-input" 
                   value={batchSettings.pause} 
                   onChange={e => setBatchSettings({...batchSettings, pause: e.target.value})}
                />
                <span>minutes.</span>
              </div>
            </div>

            <div className="form-group" style={{ marginTop: '2rem' }}>
              <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}><Settings size={16}/> Protocol Active Window</label>
              <div style={{ fontSize: '0.875rem', color: 'var(--slate)', marginBottom: '1rem' }}>Strictly restrict traffic to core office hours.</div>
              <div className="inline-form">
                <input 
                   type="time" 
                   className="form-input" 
                   value={activeWindow.start} 
                   onChange={e => setActiveWindow({...activeWindow, start: e.target.value})} 
                />
                <span style={{ fontWeight: 600 }}>—</span>
                <input 
                   type="time" 
                   className="form-input" 
                   value={activeWindow.end} 
                   onChange={e => setActiveWindow({...activeWindow, end: e.target.value})} 
                />
              </div>
            </div>
         </div>
         
         <div className="fail-safe-panel" style={{ background: globalFailsafe ? '#FCE8E6' : 'rgba(255, 255, 255, 0.6)' }}>
            <h3 className="fail-safe-title">
               <AlertTriangle size={18} /> Global Failsafe {globalFailsafe && '(TRIGGERED)'}
            </h3>
            <p style={{ fontSize: '0.875rem', lineHeight: 1.6, marginBottom: '1.5rem', color: '#555' }}>
              If standard endpoints experience `401 Unauthorized` or escalate to `429 Too Many Requests`, VeloReach instantly halts all jobs, rotates keys, and sounds alarms.
            </p>
            
            <div className="fail-safe-status" style={{ background: globalFailsafe ? '#D93025' : '#E6F4EA', color: globalFailsafe ? 'white' : '#1E8E3E' }}>
               {globalFailsafe ? 'PROTOCOL HALTED' : 'ACTIVE FIREWALL: ON'}
            </div>
         </div>
      </div>
    </div>
  );

  const renderContent = () => {
    let content;
    switch (activeTab) {
      case 'extractors': content = LeadExtractor(); break;
      case 'dashboard': content = LeadDashboard(); break;
      case 'bulk': content = BulkEngine(); break;
      case 'inbox': content = PriorityInbox(); break;
      case 'ai_assistant': content = AiAssistant(); break;
      case 'safety': content = AntiBanSettings(); break;
      case 'help': content = HelpCenter(); break;
      default: content = LeadDashboard(); break;
    }
    return <ErrorBoundary key={activeTab}>{content}</ErrorBoundary>;
  };

  if (isLocked) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', justifyContent: 'center', alignItems: 'center', background: '#F8F9FA', fontFamily: 'Inter, sans-serif' }}>
          <div style={{ width: '480px', padding: '40px', background: 'white', borderRadius: '16px', boxShadow: '0 10px 40px rgba(0,0,0,0.08)', textAlign: 'center' }}>
              <ShieldCheck size={48} color="#D93025" style={{ marginBottom: '20px', display: 'inline-block' }} />
              <h2 style={{ fontSize: '24px', fontWeight: 600, color: '#202124', margin: '0 0 12px 0' }}>Activation Required</h2>
              <p style={{ color: '#5F6368', marginBottom: '32px', lineHeight: 1.6 }}>Your VeloReach cryptographic license is missing or expired. Please submit a valid license key below to resume autonomous operations.</p>
              
              <textarea 
                  value={licenseKeyInput} 
                  onChange={(e) => setLicenseKeyInput(e.target.value)}
                  placeholder="Paste your base64 cryptographic license key here..."
                  style={{ width: '100%', height: '120px', padding: '16px', border: '1px solid #E8EAED', borderRadius: '8px', fontSize: '14px', fontFamily: 'monospace', marginBottom: '24px', outline: 'none', resize: 'vertical' }}
              />
              <button 
                  onClick={() => socket?.emit('submit_license', licenseKeyInput)}
                  style={{ width: '100%', background: '#202124', color: 'white', padding: '14px', border: 'none', borderRadius: '8px', fontWeight: 500, cursor: 'pointer', transition: 'background 0.2s', fontSize: '16px' }}
              >
                  Verify License & Boot Protocol
              </button>
          </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      {toastMessage && <Toast message={toastMessage} onClose={() => setToastMessage(null)} />}
      
      {/* Modal for QR Code */}
      {showQrModal && (
         <div className="modal-overlay">
            <div className="modal-content animated fadeIn">
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <div style={{ fontWeight: 600, fontSize: '1.25rem' }}>Connect WhatsApp Protocol</div>
                  <X style={{ cursor: 'pointer' }} onClick={() => setShowQrModal(false)} />
               </div>
               
               {qrCode ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                     <p style={{ color: 'var(--slate)', marginBottom: '24px' }}>Scan this QR code using your WhatsApp Linked Devices screen.</p>
                     <img 
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=256x256&data=${encodeURIComponent(qrCode)}`} 
                        alt="WhatsApp QR Code"
                        style={{ border: '8px solid white', borderRadius: '8px', boxShadow: 'var(--shadow-soft)' }}
                     />
                  </div>
               ) : (
                  <p style={{ color: 'var(--slate)' }}>Waiting for QR Code from Baileys engine...</p>
               )}
            </div>
         </div>
      )}

      {/* Modal for Manual Lead Entry */}
      {showManualModal && (
         <div className="modal-overlay">
            <div className="modal-content animated fadeIn" style={{ textAlign: 'left' }}>
               <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
                  <div style={{ fontWeight: 600, fontSize: '1.25rem' }}>Manual Quick-Add</div>
                  <X style={{ cursor: 'pointer' }} onClick={() => setShowManualModal(false)} />
               </div>
               
               <form onSubmit={handleManualSubmit}>
                  <div className="form-group">
                    <label className="form-label">Business / Contact Name</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      required 
                      value={manualForm.name}
                      onChange={(e) => setManualForm({...manualForm, name: e.target.value})}
                      placeholder="e.g. Fabric World Corp"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Phone Number (with Country Code)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      required 
                      value={manualForm.contact}
                      onChange={(e) => setManualForm({...manualForm, contact: e.target.value})}
                      placeholder="e.g. +19876543210"
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Category / Note (Optional)</label>
                    <input 
                      type="text" 
                      className="form-input" 
                      value={manualForm.category}
                      onChange={(e) => setManualForm({...manualForm, category: e.target.value})}
                      placeholder="e.g. VIP Prospect"
                    />
                  </div>
                  <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                    Save Lead
                  </button>
               </form>
            </div>
         </div>
      )}

      <aside className="sidebar">
        <div className="sidebar-logo">
          <Activity color="var(--aqua-drift-dark)" size={28} />
          VeloReach
        </div>
        
        <nav className="nav-menu">
          {[
            { id: 'extractors', icon: Users, label: 'Lead Extractors' },
            { id: 'dashboard', icon: Database, label: 'The Holding Pen' },
            { id: 'bulk', icon: Send, label: 'Campaign Engine' },
            { id: 'inbox', icon: Inbox, label: 'Priority Inbox' },
            { id: 'ai_assistant', icon: MessageSquare, label: 'AI Assistant' },
            { id: 'safety', icon: ShieldCheck, label: 'Safety Policies' },
            { id: 'help', icon: HelpCircle, label: 'Help Center' },
          ].map(item => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <div 
                key={item.id}
                className={`nav-item ${isActive ? 'active' : ''}`}
                onClick={() => setActiveTab(item.id)}
              >
                <Icon size={20} color={isActive ? 'var(--aqua-drift-dark)' : 'currentColor'} />
                {item.label}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="status-indicator" style={{ flexDirection: 'column', alignItems: 'stretch' }}>
             <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <span className="status-dot" style={{ backgroundColor: protocolStatus.connected ? '#1E8E3E' : (globalFailsafe ? '#D93025' : '#F9AB00'), boxShadow: `0 0 8px ${protocolStatus.connected ? '#1E8E3E' : (globalFailsafe ? '#D93025' : '#F9AB00')}` }}></span>
                <div>
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--slate)', fontWeight: 600 }}>Protocol</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: globalFailsafe ? '#D93025' : 'inherit' }}>{protocolStatus.message}</div>
                </div>
             </div>
             
             {!protocolStatus.connected && !globalFailsafe && (
                <button 
                  className="btn-primary" 
                  style={{ marginTop: '16px', padding: '10px 16px', fontSize: '0.875rem', justifyContent: 'center' }}
                  onClick={() => setShowQrModal(true)}
                >
                  <QrCode size={16} /> Connect WhatsApp
                </button>
             )}

             {protocolStatus.connected && (
                <button 
                  className="btn-secondary" 
                  style={{ marginTop: '16px', padding: '10px 16px', fontSize: '0.875rem', justifyContent: 'center', borderColor: '#D93025', color: '#D93025' }}
                  onClick={handleLogout}
                >
                  <LogOut size={16} /> Log Out Device
                </button>
             )}
             
             <div style={{ marginTop: '12px', fontSize: '0.65rem', color: 'var(--slate)', textAlign: 'center' }}>
                Socket Status: {socketHeartbeat}
             </div>
          </div>
        </div>
      </aside>

      <main className="main-content">
        <header className="main-header">
          <div>
            <h1 className="heading-1">Workspace</h1>
            <p className="text-overline">VeloReach Architecture</p>
          </div>
          <div className="profile-avatar">VR</div>
        </header>

        <div className="content-area">
           {renderContent()}
        </div>
      </main>

      {/* Floating System Logs */}
      <div style={{ position: 'fixed', bottom: '20px', right: '20px', zIndex: 1000, width: showLogs ? '400px' : 'auto' }}>
          {showLogs ? (
              <div style={{ background: '#1e1e1e', borderRadius: '8px', border: '1px solid #333', boxShadow: '0 10px 30px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
                  <div style={{ background: '#2d2d2d', padding: '8px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #333' }}>
                      <span style={{ color: '#fff', fontSize: '0.875rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Terminal size={14} /> System Console
                      </span>
                      <button onClick={() => setShowLogs(false)} style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer' }}>
                          <X size={16} />
                      </button>
                  </div>
                  <div style={{ height: '300px', overflowY: 'auto', padding: '12px', fontFamily: 'monospace', fontSize: '0.75rem', display: 'flex', flexDirection: 'column-reverse' }}>
                      {systemLogs.length === 0 ? (
                          <div style={{ color: '#666', textAlign: 'center', marginTop: '20px' }}>No logs yet...</div>
                      ) : (
                          systemLogs.map((log, i) => (
                              <div key={i} style={{ marginBottom: '4px', color: log.level === 'error' ? '#ff6b6b' : '#a8c7fa', borderBottom: '1px solid #333', paddingBottom: '4px' }}>
                                  <span style={{ color: '#666' }}>[{log.time}]</span> {log.message}
                              </div>
                          ))
                      )}
                  </div>
              </div>
          ) : (
              <button 
                onClick={() => setShowLogs(true)}
                style={{ background: '#1e1e1e', color: '#fff', border: '1px solid #333', borderRadius: '50px', padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.2)' }}
              >
                  <Terminal size={18} /> View Live Logs
              </button>
          )}
      </div>

    </div>
  );
}

export default App;
