# VeloReach Automation Suite

VeloReach is an enterprise-grade WhatsApp marketing engine engineered with robust anti-ban protocols, real-time Socket.io communication, and automated AI content mutation using Gemini 1.5 Flash.

## System Architecture

VeloReach operates on a decoupled client-server architecture:
- **Backend (Node.js/Express):** Port `5000`. Powered by `@whiskeysockets/baileys` for lightweight, multi-device WhatsApp protocol integration without needing the official WhatsApp Business API.
- **Data Flow (Socket.io):** A persistent bidirectional WebSocket connection bridges the backend and frontend. Extractors, Campaigns, and Priority Inbox updates stream seamlessly in real-time.

```mermaid
graph TD
    UI[Frontend: React/Vite] <-->|Socket.io events| BE[Backend: Node.js]
    BE -->|Puppeteer| GMaps[Google Maps]
    BE -->|@whiskeysockets/baileys| WA[WhatsApp Protocol]
    BE -->|REST API| Gemini[Gemini 1.5 Flash]
    WA -->|Inbound Messages| BE
```

- **Frontend (React/Vite):** Port `5173`. Uses a 'Quiet Luxury' vanilla CSS styling system for maximum performance, devoid of external bloated UI libraries like Tailwind.
- **Scraping Engine:** `puppeteer-extra-plugin-stealth` executes headless browsers configured to bypass rate limits and pipe structured lead data back via Sockets.

## Environment Variables

You must create a `.env` file in the `/backend` directory before launching the engine.

```env
# Google Gemini API Key for Content Mutation
GEMINI_API_KEY="your_api_key_here"

# Express/Socket Port
PORT=5000
```

## Deployment on Linux/Fedora

1. **System Dependencies:**
   Ensure `chromium` or `google-chrome` is installed on your Linux host for Puppeteer to bind effectively.
   ```bash
   sudo dnf install chromium
   ```

2. **Initialize Backend:**
   ```bash
   cd backend
   npm install
   npm start
   ```

3. **Initialize Frontend:**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Authentication:**
   Once both servers are running, access the frontend at `http://localhost:5173`. Click "Connect WhatsApp" and scan the generated QR code via your WhatsApp Mobile app (Linked Devices).

## Core Modules

- **Stealth G-Maps Scraper:** Targets Google Maps for high-quality local leads.
- **Group Grabber:** Iterates through connected WhatsApp groups and extracts member IDs.
- **Campaign Engine:** Injects Spintax/Variables and utilizes Gemini 1.5 to spawn phrasal variants.
- **Smart Window Scheduler:** Halts processing outside configured office hours to mimic human activity.
- **Priority Inbox:** In-flight NLP sentiment categorization (`POSITIVE`, `NEGATIVE`, `NEUTRAL`) of inbound replies.
