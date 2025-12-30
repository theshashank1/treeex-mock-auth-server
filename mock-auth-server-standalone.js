const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = 4010;
const DB_FILE = path.join(__dirname, 'db.json');

// --- DATABASE MANAGEMENT ---

// Initialize DB structure
let db = {
    users: []
};

// Load DB from disk if exists
const loadDB = () => {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(data);
            if (!db.users) db.users = []; // Ensure stricture
            console.log(`[DB] Loaded ${db.users.length} users from db.json`);
        } else {
            console.log('[DB] No db.json found, starting with empty database');
            saveDB(); // Create file
        }
    } catch (err) {
        console.error('[DB] Error loading database:', err);
    }
};

// Save DB to disk
const saveDB = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (err) {
        console.error('[DB] Error saving database:', err);
    }
};

// Load on startup
loadDB();

// --- HELPERS ---

// Generate Tokens
const generateTokens = () => ({
    access_token: `mock_access_token_${crypto.randomUUID()}`,
    refresh_token: `mock_refresh_token_${crypto.randomUUID()}`,
    token_type: "bearer"
});

// Parse JSON body
const parseBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (e) {
                resolve({});
            }
        });
    });
};

// Send JSON response
const sendJSON = (res, statusCode, data) => {
    res.writeHead(statusCode, {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization'
    });
    res.end(JSON.stringify(data));
};

// --- REQUEST HANDLER ---

const handleRequest = async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end();
        return;
    }

    const { method, url } = req;
    console.log(`[Request] ${method} ${url}`);

    try {
        // Health Check
        if (method === 'GET' && url === '/health') {
            sendJSON(res, 200, { status: "running" });
            return;
        }

        // --- POST /api/auth/signup ---
        if (method === 'POST' && url === '/api/auth/signup') {
            const body = await parseBody(req);
            const { email, password, name } = body;

            // EXACT ERROR FORMAT FROM ORIGINAL SNIPPET
            if (!email || !password) {
                sendJSON(res, 422, {
                    detail: [{ loc: ["body", "email"], msg: "field required", type: "value_error.missing" }]
                });
                return;
            }

            const newUser = {
                user_id: crypto.randomUUID(),
                name: name || "New User",
                email: email
            };

            // Add to in-memory DB and persist
            db.users.push(newUser);
            saveDB();

            const tokens = generateTokens();

            console.log(`[Signup] Created user: ${email}`);
            sendJSON(res, 200, {
                ...newUser,
                ...tokens
            });
            return;
        }

        // --- POST /api/auth/signin ---
        if (method === 'POST' && url === '/api/auth/signin') {
            const body = await parseBody(req);
            const { email, password } = body;

            // EXACT ERROR FORMAT FROM ORIGINAL SNIPPET
            if (!email || !password) {
                sendJSON(res, 422, { detail: "Email and password required" });
                return;
            }

            // MOCK BEHAVIOR:
            // "In a mock, we accept any login, but try to find the user if they signed up"
            let user = db.users.find(u => u.email === email);

            if (!user) {
                // If not found, mimic the behavior: { user_id: uuidv4() }
                // We do NOT save this ghost user to DB, just return it for the session
                user = { user_id: crypto.randomUUID() };
            }

            const tokens = generateTokens();

            console.log(`[Signin] User logged in: ${email}`);
            sendJSON(res, 200, {
                user_id: user.user_id,
                ...tokens
            });
            return;
        }

        // --- POST /api/auth/refresh ---
        if (method === 'POST' && url === '/api/auth/refresh') {
            const body = await parseBody(req);
            const { refresh_token } = body;

            // EXACT ERROR FORMAT FROM ORIGINAL SNIPPET
            if (!refresh_token) {
                sendJSON(res, 422, { detail: "Refresh token required" });
                return;
            }

            console.log(`[Refresh] Token refreshed`);
            sendJSON(res, 200, generateTokens());
            return;
        }

        // --- GET /api/auth/me ---
        if (method === 'GET' && url === '/api/auth/me') {
            const authHeader = req.headers.authorization;

            // EXACT ERROR FORMAT FROM ORIGINAL SNIPPET
            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                sendJSON(res, 401, { detail: "Not authenticated" });
                return;
            }

            // Return a default user if no one has signed up yet
            // Original: const user = users[0] || { ... }
            const user = db.users[0] || {
                user_id: crypto.randomUUID(),
                name: "Mock Admin",
                email: "admin@treeex.io"
            };

            console.log(`[Me] Profile fetched for: ${user.email}`);
            sendJSON(res, 200, user);
            return;
        }

        // 404
        sendJSON(res, 404, { detail: "Not found" });

    } catch (error) {
        console.error('[Error]', error);
        sendJSON(res, 500, { detail: "Internal server error" });
    }
};

// Start server
const server = http.createServer(handleRequest);

server.listen(PORT, () => {
    console.log(`✅ TREEEX Auth Mock Server running on http://localhost:${PORT}`);
    console.log(`📂 Database: ${DB_FILE}`);
});
