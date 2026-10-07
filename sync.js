// ==============================================================================
// Adhesive FMEA Portal - Real-Time Team Synchronization Client
// Bridges browser localStorage with central team server over LAN/HTTP
// ==============================================================================

(function(window) {
    'use strict';

    // Unique ID for this browser tab/session to avoid echo-refreshing our own edits
    const CLIENT_ID = 'client_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    let isConnected = false;
    let sseSource = null;
    let pollInterval = null;
    let localVersion = 0;
    let syncDebounceTimer = null;
    let pendingSyncPayload = {};
    let isApplyingRemoteUpdate = false;
    let serverLanIps = [];
    let serverPort = 3000;

    // Detect server base URL: If served via http(s), use same origin;
    // If opened directly as a file (file:///), connect directly to the host PC's Wi-Fi/LAN IP!
    const HOST_PC_URL = 'http://192.168.0.42:3000';
    let savedHost = null;
    try { savedHost = localStorage.getItem('fmea_custom_server_url'); } catch(e) {}
    const isHosted = window.location.protocol.startsWith('http');
    const SERVER_BASE = isHosted ? window.location.origin : (savedHost || HOST_PC_URL);

    // Intercept localStorage.setItem so every FMEA save automatically syncs to team server!
    const originalSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, val) {
        originalSetItem(key, val);
        try {
            if (!isApplyingRemoteUpdate && typeof key === 'string' && key.startsWith('fmea_')) {
                // Don't sync session-only local states like active tab or collapse
                if (key !== 'fmea_sidebar_scroll_top' && key !== 'fmea_active_form_id') {
                    let parsedVal;
                    try { parsedVal = JSON.parse(val); } catch (e) { parsedVal = val; }
                    FMEASync.queuePush(key, parsedVal);
                }
            }
        } catch (err) {
            console.warn('[FMEASync] Intercept error:', err);
        }
    };

    // Core Sync Object
    const FMEASync = {
        clientId: CLIENT_ID,
        serverUrl: SERVER_BASE,
        isConnected: false,

        // Initialize synchronization (runs silently in the background)
        init() {
            // Remove any existing badge if present
            const existingBadge = document.getElementById('team-sync-badge');
            if (existingBadge) existingBadge.remove();

            checkServerConnection().then(online => {
                if (online) {
                    initSSE();
                    initialHydrate();
                } else {
                    pollInterval = setInterval(async () => {
                        const ok = await checkServerConnection();
                        if (ok) {
                            clearInterval(pollInterval);
                            initSSE();
                            initialHydrate();
                        }
                    }, 4000);
                }
            });

            // Listen for window storage changes across multiple tabs on the same machine
            window.addEventListener('storage', (e) => {
                if (e.key && e.key.startsWith('fmea_') && !isApplyingRemoteUpdate) {
                    this.queuePush(e.key, safeParseJSON(e.newValue));
                }
            });
        },

        // Triggered whenever local data changes and needs to be broadcast to team
        queuePush(key, value) {
            if (isApplyingRemoteUpdate) return;
            pendingSyncPayload[key] = value;

            clearTimeout(syncDebounceTimer);
            syncDebounceTimer = setTimeout(() => {
                this.flushPendingSync();
            }, 350);
        },

        // Push immediately
        async flushPendingSync() {
            if (Object.keys(pendingSyncPayload).length === 0) return;
            const payload = { ...pendingSyncPayload };
            pendingSyncPayload = {};

            try {
                updateStatusUI('syncing');
                const response = await fetch(`${SERVER_BASE}/api/sync`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        senderId: CLIENT_ID,
                        data: payload
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    if (result.version) localVersion = result.version;
                    updateStatusUI('online');
                } else {
                    updateStatusUI('offline');
                }
            } catch (err) {
                console.warn('[FMEASync] Sync push error (offline mode):', err.message);
                updateStatusUI('offline');
            }
        },

        // Direct key update
        pushKeyUpdate(key, value) {
            this.queuePush(key, value);
        }
    };

    // Helper: Safe JSON parser
    function safeParseJSON(str) {
        try {
            return JSON.parse(str);
        } catch (e) {
            return str;
        }
    }

    // Ping server
    async function checkServerConnection() {
        try {
            const res = await fetch(`${SERVER_BASE}/api/status`, { cache: 'no-store' });
            if (res.ok) {
                const data = await res.json();
                if (data.version) localVersion = data.version;
                if (data.lanIps) serverLanIps = data.lanIps;
                if (data.port) serverPort = data.port;
                isConnected = true;
                FMEASync.isConnected = true;
                return true;
            }
        } catch (e) {
            // Server offline
        }
        isConnected = false;
        FMEASync.isConnected = false;
        return false;
    }

    // Initial Hydration from Server Database
    async function initialHydrate() {
        try {
            updateStatusUI('syncing');
            const res = await fetch(`${SERVER_BASE}/api/data`, { cache: 'no-store' });
            if (!res.ok) return;

            const serverDb = await res.json();
            const data = serverDb.data || {};

            // If server database is completely empty, initialize server with current client's data
            const keys = Object.keys(data);
            if (keys.length === 0) {
                console.log('[FMEASync] Central server DB empty, seeding from initial client state...');
                seedServerFromLocal();
                return;
            }

            // Central server has data: apply to local memory & storage
            localVersion = serverDb.version || 1;
            applyServerData(data, false);
            updateStatusUI('online');
        } catch (err) {
            console.error('[FMEASync] Initial hydration failed:', err);
            updateStatusUI('offline');
        }
    }

    // Seed server if starting fresh
    function seedServerFromLocal() {
        const seed = {};
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k && k.startsWith('fmea_')) {
                seed[k] = safeParseJSON(localStorage.getItem(k));
            }
        }
        if (Object.keys(seed).length > 0) {
            FMEASync.queuePush('initial_seed', seed);
        }
    }

    // Apply Server Data to Browser App
    function applyServerData(data, notifyUser = true) {
        isApplyingRemoteUpdate = true;
        try {
            let hasSignificantChanges = false;

            for (const [key, val] of Object.entries(data)) {
                if (key === 'initial_seed') {
                    applyServerData(val, false);
                    continue;
                }
                const serialized = typeof val === 'string' ? val : JSON.stringify(val);
                const currentLocal = localStorage.getItem(key);
                if (currentLocal !== serialized) {
                    originalSetItem(key, serialized);
                    hasSignificantChanges = true;
                }
            }

            // Reload memory data and re-render active UI view
            if (hasSignificantChanges) {
                if (typeof window.reloadAllFromStorage === 'function') {
                    window.reloadAllFromStorage();
                } else if (typeof window.loadAllDatabases === 'function') {
                    window.loadAllDatabases();
                }

                // Silent background sync - no intrusive toasts
            }
        } finally {
            isApplyingRemoteUpdate = false;
        }
    }

    // Connect to Server-Sent Events (SSE)
    function initSSE() {
        if (sseSource) sseSource.close();

        try {
            sseSource = new EventSource(`${SERVER_BASE}/api/events`);

            sseSource.onopen = () => {
                isConnected = true;
                FMEASync.isConnected = true;
                updateStatusUI('online');
            };

            sseSource.addEventListener('DATA_UPDATED', async (e) => {
                try {
                    const eventData = JSON.parse(e.data);
                    // Ignore echo updates sent by our own client
                    if (eventData.senderId === CLIENT_ID) return;

                    updateStatusUI('syncing');
                    const res = await fetch(`${SERVER_BASE}/api/data`, { cache: 'no-store' });
                    if (res.ok) {
                        const serverDb = await res.json();
                        localVersion = serverDb.version || localVersion;
                        applyServerData(serverDb.data || {}, true);
                    }
                    updateStatusUI('online');
                } catch (err) {
                    console.error('[FMEASync] SSE update processing error:', err);
                }
            });

            sseSource.onerror = () => {
                isConnected = false;
                FMEASync.isConnected = false;
                updateStatusUI('offline');
            };
        } catch (e) {
            console.warn('[FMEASync] SSE not supported or blocked, falling back to polling');
            startPollingFallback();
        }
    }

    // Polling fallback if SSE is not available
    function startPollingFallback() {
        setInterval(async () => {
            try {
                const res = await fetch(`${SERVER_BASE}/api/status`, { cache: 'no-store' });
                if (!res.ok) return;
                const status = await res.json();
                if (status.version && status.version > localVersion) {
                    localVersion = status.version;
                    const dataRes = await fetch(`${SERVER_BASE}/api/data`, { cache: 'no-store' });
                    if (dataRes.ok) {
                        const db = await dataRes.json();
                        applyServerData(db.data || {}, true);
                    }
                }
            } catch (err) {}
        }, 3000);
    }

    // Status UI functions removed per user request - sync operates silently in background
    function createSyncStatusBadge() {
        const badge = document.getElementById('team-sync-badge');
        if (badge) badge.remove();
    }

    function updateStatusUI(status) {
        // Silent background mode - no visual badge
    }

    // Modal showing Team Share Link
    function showShareModal() {
        const existing = document.getElementById('team-share-modal');
        if (existing) existing.remove();

        let shareUrl = `http://localhost:${serverPort}`;
        if (serverLanIps && serverLanIps.length > 0) {
            shareUrl = `http://${serverLanIps[0].address}:${serverPort}`;
        } else if (window.location.protocol.startsWith('http')) {
            shareUrl = window.location.origin;
        }

        const modal = document.createElement('div');
        modal.id = 'team-share-modal';
        modal.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            background: rgba(15, 23, 42, 0.55);
            backdrop-filter: blur(4px);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 100000;
        `;

        modal.innerHTML = `
            <div style="background: #ffffff; border-radius: 14px; padding: 1.75rem; max-width: 500px; width: 92%; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.15); border: 1px solid #e2e8f0; font-family: 'Inter', sans-serif;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                    <div style="display: flex; align-items: center; gap: 0.6rem;">
                        <span style="display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 10px; background: #ecfdf5; color: #059669; font-size: 1.2rem;">🤝</span>
                        <h3 style="margin: 0; font-size: 1.15rem; font-weight: 700; color: #0f172a;">Live Team Collaboration</h3>
                    </div>
                    <button id="close-share-modal" style="background: none; border: none; font-size: 1.25rem; cursor: pointer; color: #94a3b8; padding: 4px;">&times;</button>
                </div>
                
                <p style="font-size: 0.85rem; color: #475569; margin-bottom: 1.25rem; line-height: 1.5;">
                    Share this link with your team on your Wi-Fi or office network.
                    <br><strong style="color: #059669;">Whenever any person makes a change, everyone's screen updates live automatically!</strong>
                </p>

                <div style="margin-bottom: 1.25rem;">
                    <label style="display: block; font-size: 0.78rem; font-weight: 600; color: #64748b; margin-bottom: 0.4rem; text-transform: uppercase; letter-spacing: 0.05em;">Team Share Link (LAN / Wi-Fi)</label>
                    <div style="display: flex; gap: 0.5rem;">
                        <input id="share-link-input" type="text" readonly value="${shareUrl}" style="flex: 1; padding: 0.6rem 0.8rem; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 0.88rem; font-family: monospace; background: #f8fafc; color: #1e293b;">
                        <button id="copy-share-link" class="btn btn-primary" style="padding: 0.6rem 1.1rem; border-radius: 8px; font-weight: 600; font-size: 0.85rem; white-space: nowrap; cursor: pointer;">Copy Link</button>
                    </div>
                </div>

                <div style="padding: 0.75rem 1rem; border-radius: 8px; background: #f1f5f9; font-size: 0.78rem; color: #64748b; line-height: 1.45;">
                    <strong>💡 Server Status:</strong> Server running on port ${serverPort}. Simply run <code style="background: #e2e8f0; padding: 2px 4px; border-radius: 4px;">start_server.bat</code> on this computer whenever you want to host the session for your team.
                </div>
            </div>
        `;

        document.body.appendChild(modal);

        modal.querySelector('#close-share-modal').addEventListener('click', () => modal.remove());
        modal.addEventListener('click', (e) => {
            if (e.target === modal) modal.remove();
        });

        const copyBtn = modal.querySelector('#copy-share-link');
        const inputEl = modal.querySelector('#share-link-input');
        copyBtn.addEventListener('click', () => {
            inputEl.select();
            navigator.clipboard.writeText(inputEl.value).then(() => {
                copyBtn.textContent = 'Copied! ✓';
                setTimeout(() => { copyBtn.textContent = 'Copy Link'; }, 2000);
            });
        });
    }

    // Expose globally
    window.FMEASync = FMEASync;

    // Auto-initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => FMEASync.init());
    } else {
        FMEASync.init();
    }

})(window);
