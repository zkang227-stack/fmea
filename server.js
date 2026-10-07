// ==============================================================================
// Adhesive FMEA Portal - Lightweight Team LAN Server
// Built with native Node.js (Zero external dependencies)
// Enables real-time team synchronization across local network / Wi-Fi
// ==============================================================================

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const PORT = process.env.PORT || 3000;
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const DB_FILE = path.join(DATA_DIR, 'fmea_database.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
}

// MIME types dictionary for static file serving
const MIME_TYPES = {
    '.html': 'text/html; charset=UTF-8',
    '.css': 'text/css; charset=UTF-8',
    '.js': 'application/javascript; charset=UTF-8',
    '.json': 'application/json; charset=UTF-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf'
};

// In-memory Database State & SSE Clients
let currentVersion = 1;
let lastModified = new Date().toISOString();
let sseClients = [];

// Helper: Read Database from Disk
function readDatabase() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const raw = fs.readFileSync(DB_FILE, 'utf8');
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                if (parsed.version) currentVersion = parsed.version;
                if (parsed.lastModified) lastModified = parsed.lastModified;
                return parsed;
            }
        }
    } catch (err) {
        console.error('[Server] Error reading fmea_database.json:', err.message);
    }
    return {
        version: 1,
        lastModified: new Date().toISOString(),
        data: {}
    };
}

// Helper: Write Database to Disk
function writeDatabase(payload) {
    try {
        currentVersion++;
        lastModified = new Date().toISOString();
        const dbState = {
            version: currentVersion,
            lastModified: lastModified,
            data: payload
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(dbState, null, 2), 'utf8');
        return dbState;
    } catch (err) {
        console.error('[Server] Error writing fmea_database.json:', err.message);
        throw err;
    }
}

// Helper: Broadcast event to all SSE connected clients
function broadcastEvent(eventType, data) {
    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    sseClients = sseClients.filter(client => {
        try {
            client.res.write(message);
            return true;
        } catch (e) {
            return false;
        }
    });
}

// Helper: Get local network IPv4 addresses
function getLocalIPAddresses() {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                addresses.push({ interface: name, address: net.address });
            }
        }
    }
    return addresses;
}

// Request Handler
const server = http.createServer((req, res) => {
    // Enable CORS for LAN access
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    let pathname = decodeURIComponent(parsedUrl.pathname);

    // ==========================================
    // API: Server-Sent Events (Live Sync Stream)
    // ==========================================
    if (pathname === '/api/events') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'Access-Control-Allow-Origin': '*'
        });
        res.write(`data: ${JSON.stringify({ type: 'CONNECTED', version: currentVersion })}\n\n`);

        const client = { id: Date.now() + Math.random(), res };
        sseClients.push(client);

        req.on('close', () => {
            sseClients = sseClients.filter(c => c.id !== client.id);
        });
        return;
    }

    // ==========================================
    // API: Get Status / Version
    // ==========================================
    if (pathname === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            status: 'online',
            version: currentVersion,
            lastModified: lastModified,
            connectedClients: sseClients.length,
            port: PORT,
            lanIps: getLocalIPAddresses()
        }));
        return;
    }

    // ==========================================
    // API: Get Full Shared Database
    // ==========================================
    if (pathname === '/api/data' && req.method === 'GET') {
        const db = readDatabase();
        res.writeHead(200, {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache'
        });
        res.end(JSON.stringify(db));
        return;
    }

    // ==========================================
    // API: Sync / Save Database
    // ==========================================
    if (pathname === '/api/sync' && req.method === 'POST') {
        let body = '';
        req.on('data', chunk => {
            body += chunk;
            // Guard against massive payloads (> 50MB)
            if (body.length > 50 * 1024 * 1024) {
                res.writeHead(413, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Payload too large' }));
                req.destroy();
            }
        });

        req.on('end', () => {
            try {
                const incoming = JSON.parse(body);
                const currentDb = readDatabase();

                // Merge incoming datasets into current database
                const updatedData = { ...currentDb.data };
                if (incoming.data && typeof incoming.data === 'object') {
                    Object.assign(updatedData, incoming.data);
                }

                const savedDb = writeDatabase(updatedData);

                // Broadcast change notification to all other clients immediately!
                broadcastEvent('DATA_UPDATED', {
                    version: savedDb.version,
                    lastModified: savedDb.lastModified,
                    senderId: incoming.senderId || null,
                    key: incoming.key || null
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                    success: true,
                    version: savedDb.version,
                    lastModified: savedDb.lastModified
                }));
            } catch (err) {
                console.error('[Server] POST /api/sync error:', err);
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: err.message }));
            }
        });
        return;
    }

    // ==========================================
    // Static Files Serving
    // ==========================================
    if (pathname === '/') {
        pathname = '/index.html';
    }

    // Security check: prevent directory traversal
    const safePath = path.normalize(path.join(ROOT_DIR, pathname));
    if (!safePath.startsWith(ROOT_DIR)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('403 Forbidden');
        return;
    }

    fs.stat(safePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404, { 'Content-Type': 'text/plain' });
            res.end('404 Not Found');
            return;
        }

        const ext = path.extname(safePath).toLowerCase();
        const contentType = MIME_TYPES[ext] || 'application/octet-stream';

        // Set no-cache for HTML, JS, CSS to ensure immediate team sync
        res.writeHead(200, {
            'Content-Type': contentType,
            'Cache-Control': 'no-cache, no-store, must-revalidate'
        });

        const stream = fs.createReadStream(safePath);
        stream.pipe(res);
    });
});

// Start Cloudflare Tunnel for direct public web access
// Start Server
server.listen(PORT, '0.0.0.0', () => {
    const ips = getLocalIPAddresses();
    console.log('================================================================');
    console.log('  FMEA PORTAL - REAL-TIME COMPANY TEAM SERVER');
    console.log('================================================================');
    console.log(`  Local PC Access:          http://localhost:${PORT}`);
    console.log(`  Computer Name Access:     http://DESKTOP-BQDL6ES:${PORT}`);
    if (ips.length > 0) {
        console.log('  Company Wi-Fi / LAN Links (Share with Team):');
        ips.forEach(ip => {
            console.log(`  👉 http://${ip.address}:${PORT}  (${ip.interface})`);
        });
    }
    console.log('================================================================');
    console.log('  All edits made by any team member will instantly sync live!');
    console.log('================================================================\n');
});
