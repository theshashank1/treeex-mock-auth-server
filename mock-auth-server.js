const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = 4010;

app.use(cors());
app.use(bodyParser.json());

// Mock database for "persistence" during the session
const users = new Map(); // email -> user object
const tokens = new Map(); // access_token -> user_id
const refreshTokens = new Map(); // refresh_token -> user_id

// --- HELPER: Validate Email Format ---
const isValidEmail = (email) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
};

// --- HELPER: Validate Password Strength ---
const validatePassword = (password) => {
    if (!password) {
        return { valid: false, message: "Password is required" };
    }
    if (password.length < 8) {
        return { valid: false, message: "Password must be at least 8 characters long" };
    }
    return { valid: true };
};

// --- HELPER: Generate Mock Tokens with Expiry ---
const generateTokens = (userId) => {
    const accessToken = `mock_access_${uuidv4()}`;
    const refreshToken = `mock_refresh_${uuidv4()}`;

    tokens.set(accessToken, {
        userId,
        expiresAt: Date.now() + 3600000 // 1 hour
    });

    refreshTokens.set(refreshToken, {
        userId,
        expiresAt: Date.now() + 2592000000 // 30 days
    });

    return {
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: "bearer",
        expires_in: 3600
    };
};

// --- HELPER: Verify Access Token ---
const verifyAccessToken = (authHeader) => {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return { valid: false, error: "Missing or invalid authorization header", status: 401 };
    }

    const token = authHeader.substring(7);
    const tokenData = tokens.get(token);

    if (!tokenData) {
        return { valid: false, error: "Invalid or expired access token", status: 401 };
    }

    if (tokenData.expiresAt < Date.now()) {
        tokens.delete(token);
        return { valid: false, error: "Access token has expired", status: 401 };
    }

    return { valid: true, userId: tokenData.userId };
};

// --- POST /api/auth/signup ---
app.post('/api/auth/signup', (req, res) => {
    const { email, password, name } = req.body;

    // Validation: Required fields
    if (!email || !password) {
        return res.status(422).json({
            detail: [
                ...(!email ? [{
                    loc: ["body", "email"],
                    msg: "field required",
                    type: "value_error.missing"
                }] : []),
                ...(!password ? [{
                    loc: ["body", "password"],
                    msg: "field required",
                    type: "value_error.missing"
                }] : [])
            ]
        });
    }

    // Validation: Email format
    if (!isValidEmail(email)) {
        return res.status(422).json({
            detail: [{
                loc: ["body", "email"],
                msg: "invalid email format",
                type: "value_error.email"
            }]
        });
    }

    // Validation: Password strength
    const passwordValidation = validatePassword(password);
    if (!passwordValidation.valid) {
        return res.status(422).json({
            detail: [{
                loc: ["body", "password"],
                msg: passwordValidation.message,
                type: "value_error.password"
            }]
        });
    }

    // Check if user already exists
    if (users.has(email.toLowerCase())) {
        return res.status(409).json({
            detail: "User with this email already exists"
        });
    }

    // Create new user
    const userId = uuidv4();
    const newUser = {
        user_id: userId,
        name: name || email.split('@')[0],
        email: email.toLowerCase(),
        created_at: new Date().toISOString()
    };

    users.set(email.toLowerCase(), newUser);
    const authTokens = generateTokens(userId);

    console.log(`[Signup] ✅ Created user: ${email}`);

    res.status(201).json({
        ...newUser,
        ...authTokens
    });
});

// --- POST /api/auth/signin ---
app.post('/api/auth/signin', (req, res) => {
    const { email, password } = req.body;

    // Validation: Required fields
    if (!email || !password) {
        return res.status(422).json({
            detail: [
                ...(!email ? [{
                    loc: ["body", "email"],
                    msg: "field required",
                    type: "value_error.missing"
                }] : []),
                ...(!password ? [{
                    loc: ["body", "password"],
                    msg: "field required",
                    type: "value_error.missing"
                }] : [])
            ]
        });
    }

    // Validation: Email format
    if (!isValidEmail(email)) {
        return res.status(422).json({
            detail: [{
                loc: ["body", "email"],
                msg: "invalid email format",
                type: "value_error.email"
            }]
        });
    }

    // Find user
    const user = users.get(email.toLowerCase());

    if (!user) {
        return res.status(401).json({
            detail: "Invalid email or password"
        });
    }

    // In production, you'd verify password hash here
    // For mock, we accept any password for existing users
    const authTokens = generateTokens(user.user_id);

    console.log(`[Signin] ✅ User logged in: ${email}`);

    res.status(200).json({
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        ...authTokens
    });
});

// --- POST /api/auth/refresh ---
app.post('/api/auth/refresh', (req, res) => {
    const { refresh_token } = req.body;

    // Validation: Required field
    if (!refresh_token) {
        return res.status(422).json({
            detail: [{
                loc: ["body", "refresh_token"],
                msg: "field required",
                type: "value_error.missing"
            }]
        });
    }

    // Verify refresh token
    const tokenData = refreshTokens.get(refresh_token);

    if (!tokenData) {
        return res.status(401).json({
            detail: "Invalid or expired refresh token"
        });
    }

    if (tokenData.expiresAt < Date.now()) {
        refreshTokens.delete(refresh_token);
        return res.status(401).json({
            detail: "Refresh token has expired"
        });
    }

    // Generate new tokens
    const authTokens = generateTokens(tokenData.userId);

    // Optionally invalidate old refresh token
    refreshTokens.delete(refresh_token);

    console.log(`[Refresh] ✅ Token refreshed for user: ${tokenData.userId}`);

    res.status(200).json(authTokens);
});

// --- GET /api/auth/me ---
app.get('/api/auth/me', (req, res) => {
    const authHeader = req.headers.authorization;

    // Verify token
    const verification = verifyAccessToken(authHeader);

    if (!verification.valid) {
        return res.status(verification.status).json({
            detail: verification.error
        });
    }

    // Find user by ID
    const user = Array.from(users.values()).find(u => u.user_id === verification.userId);

    if (!user) {
        return res.status(404).json({
            detail: "User not found"
        });
    }

    console.log(`[Me] ✅ Profile fetched for: ${user.email}`);

    res.status(200).json({
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        created_at: user.created_at
    });
});

// --- POST /api/auth/logout ---
app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const tokenData = tokens.get(token);

        if (tokenData) {
            // Remove access token
            tokens.delete(token);

            // Remove all refresh tokens for this user
            for (const [refreshToken, data] of refreshTokens.entries()) {
                if (data.userId === tokenData.userId) {
                    refreshTokens.delete(refreshToken);
                }
            }

            console.log(`[Logout] ✅ User logged out: ${tokenData.userId}`);
        }
    }

    res.status(200).json({
        message: "Successfully logged out"
    });
});

// --- POST /api/auth/password/reset-request ---
app.post('/api/auth/password/reset-request', (req, res) => {
    const { email } = req.body;

    // Validation: Required field
    if (!email) {
        return res.status(422).json({
            detail: [{
                loc: ["body", "email"],
                msg: "field required",
                type: "value_error.missing"
            }]
        });
    }

    // Validation: Email format
    if (!isValidEmail(email)) {
        return res.status(422).json({
            detail: [{
                loc: ["body", "email"],
                msg: "invalid email format",
                type: "value_error.email"
            }]
        });
    }

    // In production, don't reveal if email exists
    // For mock, we'll accept any email
    console.log(`[Password Reset] 📧 Reset requested for: ${email}`);

    res.status(200).json({
        message: "If the email exists, a password reset link has been sent"
    });
});

// --- Health Check ---
app.get('/health', (req, res) => {
    res.status(200).json({
        status: "running",
        timestamp: new Date().toISOString(),
        stats: {
            users: users.size,
            active_tokens: tokens.size,
            refresh_tokens: refreshTokens.size
        }
    });
});

// --- 404 Handler ---
app.use('*', (req, res) => {
    res.status(404).json({
        detail: "Not found"
    });
});

// --- Error Handler ---
app.use((err, req, res, next) => {
    console.error('[Error]', err);
    res.status(500).json({
        detail: "Internal server error"
    });
});

// --- Start Server ---
app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('✅ TREEEX Auth Mock Server Running');
    console.log('='.repeat(60));
    console.log(`🌐 Base URL: http://localhost:${PORT}`);
    console.log('\n📍 Available Endpoints:');
    console.log(`   POST   /api/auth/signup              - Create new account`);
    console.log(`   POST   /api/auth/signin              - Login to account`);
    console.log(`   POST   /api/auth/refresh             - Refresh access token`);
    console.log(`   GET    /api/auth/me                  - Get current user`);
    console.log(`   POST   /api/auth/logout              - Logout user`);
    console.log(`   POST   /api/auth/password/reset-request - Request password reset`);
    console.log(`   GET    /health                       - Health check`);
    console.log('='.repeat(60) + '\n');
});
