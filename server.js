const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = 4010;
const DB_FILE = path.join(__dirname, 'auth-db.json');

// --- DATABASE MANAGEMENT ---

let db = { users: [] };

const loadDB = () => {
    try {
        if (fs.existsSync(DB_FILE)) {
            const data = fs.readFileSync(DB_FILE, 'utf8');
            db = JSON.parse(data);
            if (!db.users) db.users = [];
            console.log(`[DB] Loaded ${db.users.length} users from db.json`);
        } else {
            console.log('[DB] No db.json found, starting with empty database');
            saveDB();
        }
    } catch (err) {
        console.error('[DB] Error loading database:', err);
    }
};

const saveDB = () => {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (err) {
        console.error('[DB] Error saving database:', err);
    }
};

loadDB();

// --- HELPERS ---

const generateTokens = () => ({
    access_token: `mock_access_token_${crypto.randomUUID()}`,
    refresh_token: `mock_refresh_token_${crypto.randomUUID()}`,
    token_type: "bearer",
    expires_at: Math.floor(Date.now() / 1000) + 3600 // Adding expires_at to match schema
});

// Robust JSON Body Parser
const parseBody = (req) => {
    return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => body += chunk.toString());
        req.on('end', () => {
            try {
                // If body is empty string, return empty object
                if (!body) return resolve({});
                resolve(JSON.parse(body));
            } catch (e) {
                // Reject invalid JSON to allow 400 response
                reject(new Error("Invalid JSON"));
            }
        });
    });
};

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
    // Robust URL parsing
    // req.headers.host might be undefined in some raw HTTP clients, fallback to localhost
    const baseURL = `http://${req.headers.host || 'localhost'}`;
    const parsedUrl = new URL(req.url, baseURL);
    const pathname = parsedUrl.pathname;
    const method = req.method;

    // Handle CORS preflight
    if (method === 'OPTIONS') {
        res.writeHead(204, {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        res.end();
        return;
    }

    console.log(`[Request] ${method} ${pathname}`);

    try {
        // Health Check
        if (method === 'GET' && pathname === '/health') {
            sendJSON(res, 200, { status: "running" });
            return;
        }

        // --- POST /api/auth/signup ---
        if (method === 'POST' && pathname === '/api/auth/signup') {
            let body;
            try { body = await parseBody(req); } catch (e) { return sendJSON(res, 400, { detail: "Invalid JSON" }); }

            const { email, password, name } = body;

            // Missing fields -> 422 (Schema validation error)
            if (email === undefined || password === undefined) {
                sendJSON(res, 422, {
                    detail: [{ loc: ["body", "field"], msg: "field required", type: "value_error.missing" }]
                });
                return;
            }

            // Empty fields -> 400 (Business logic check)
            if (!email || !password) {
                sendJSON(res, 400, { detail: "Email and password are required" });
                return;
            }

            const newUser = {
                user_id: crypto.randomUUID(),
                name: name || email.split('@')[0],
                email: email,
                created_at: new Date().toISOString(),
                is_active: true,
                email_verified: true,
                last_login_at: null
            };

            db.users.push(newUser);
            saveDB();

            const tokens = generateTokens();

            console.log(`[Signup] Created user: ${email}`);

            // Response matches SignupResponse schema
            sendJSON(res, 200, {
                user_id: newUser.user_id,
                name: newUser.name,
                email: newUser.email,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token
            });
            return;
        }

        // --- POST /api/auth/signin ---
        if (method === 'POST' && pathname === '/api/auth/signin') {
            let body;
            try { body = await parseBody(req); } catch (e) { return sendJSON(res, 400, { detail: "Invalid JSON" }); }

            const { email, password } = body;

            // Missing fields -> 422
            if (email === undefined || password === undefined) {
                // Simplified 422 for signin to match common frontend expectations or Pydantic
                sendJSON(res, 422, { detail: "Email and password are required" });
                return;
            }

            // Empty fields -> 400
            if (!email || !password) {
                sendJSON(res, 400, { detail: "Email and password are required" });
                return;
            }

            // MOCK LOGIC: Try find, else mock
            let user = db.users.find(u => u.email === email);
            if (!user) {
                // Ghost user
                user = { user_id: crypto.randomUUID() };
            }

            const tokens = generateTokens();
            console.log(`[Signin] User logged in: ${email}`);

            // Response must match SigninResponse (NO name/email)
            sendJSON(res, 200, {
                user_id: user.user_id,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                token_type: "bearer"
            });
            return;
        }

        // --- POST /api/auth/refresh ---
        if (method === 'POST' && pathname === '/api/auth/refresh') {
            let body;
            try { body = await parseBody(req); } catch (e) { return sendJSON(res, 400, { detail: "Invalid JSON" }); }

            const { refresh_token } = body;

            if (!refresh_token) {
                sendJSON(res, 422, { detail: "Refresh token required" });
                return;
            }

            console.log(`[Refresh] Token refreshed`);
            // Response matches refresh schema (has expires_at)
            sendJSON(res, 200, generateTokens());
            return;
        }

        // --- GET /api/auth/me ---
        if (method === 'GET' && pathname === '/api/auth/me') {
            const authHeader = req.headers.authorization;

            if (!authHeader || !authHeader.startsWith('Bearer ')) {
                sendJSON(res, 401, { detail: "Not authenticated" });
                return;
            }

            // Return full profile matching schema
            const user = db.users[0] || {
                user_id: crypto.randomUUID(),
                name: "Mock Admin",
                email: "admin@treeex.io",
                created_at: new Date().toISOString(),
                is_active: true,
                email_verified: true,
                last_login_at: new Date().toISOString()
            };

            console.log(`[Me] Profile fetched for: ${user.email}`);

            // Ensure strictly matched fields
            sendJSON(res, 200, {
                user_id: user.user_id,
                email: user.email,
                name: user.name,
                email_verified: user.email_verified || true,
                is_active: user.is_active || true,
                created_at: user.created_at,
                last_login_at: user.last_login_at
            });
            return;
        }

        // 404
        sendJSON(res, 404, { detail: "Not found" });

    } catch (error) {
        console.error('[Error]', error);
        sendJSON(res, 500, { detail: "Internal server error" });
    }
};

const server = http.createServer(handleRequest);

server.listen(PORT, () => {
    console.log(`✅ TREEEX Auth Mock Server running on http://localhost:${PORT}`);
    console.log(`📂 Database: ${DB_FILE}`);
});
