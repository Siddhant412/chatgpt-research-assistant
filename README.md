# chatgpt-research-assistant

A tiny end-to-end “Research Notes” app that plugs into ChatGPT via MCP (Model Context Protocol). It resolves DOIs/URLs to PDFs, downloads and indexes papers locally and lets ChatGPT summarize the paper and stores notes. A minimal React widget renders inside the ChatGPT UI.

## Prerequisites
Node.js 18+  
ngrok (or any HTTPS tunnel) for the MCP server  
ChatGPT plus/pro subscription and development mode turned on

### Setup
1. Install dependencies
```bash
# from project root
cd web && npm install && npm run build
cd ../server && npm install
```

2. Configure environment
Create server/.env
```bash
UNPAYWALL_EMAIL=example@email.com
DEBUG=1   # optional: verbose resolver logs
```

3. Run the MCP server
```bash
cd server
npm run dev   # starts on http://127.0.0.1:2091/mcp
```

4. Expose via HTTPS
```bash
#example
ngrok http 2091
```

5. Connect in ChatGPT
In ChatGPT, go to Settings -> Apps & Connectors -> Create
Endpoint: ngrok url with /mcp (e.g. https://<your-subdomain>.ngrok-free.app/mcp)
Auth: No auth
Save

6. Use app in Chat
Open a chat, and add the created app into the chat to use it
