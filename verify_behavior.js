const http = require('http');
const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'db.json');

// Helper to make requests
function request(method, path, body = null, headers = {}) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 4010,
            path: path,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                resolve({
                    status: res.statusCode,
                    body: data ? JSON.parse(data) : {},
                    headers: res.headers
                });
            });
        });

        req.on('error', (e) => {
            console.error(`Request failed: ${e.message}`);
            resolve({ status: 500, body: {}, headers: {} });
        });

        if (body) {
            req.write(JSON.stringify(body));
        }
        req.end();
    });
}

async function runTests() {
    console.log("🚀 Starting Comprehensive Verification Tests...\n");
    console.log("=".repeat(60));
    let passed = 0;
    let failed = 0;

    const assert = (name, condition, expected = null, actual = null) => {
        if (condition) {
            console.log(`✅ [PASS] ${name}`);
            passed++;
        } else {
            console.log(`❌ [FAIL] ${name}`);
            if (expected !== null && actual !== null) {
                console.log(`   Expected: ${JSON.stringify(expected)}`);
                console.log(`   Actual:   ${JSON.stringify(actual)}`);
            }
            failed++;
        }
    };

    // Clean db.json before tests
    if (fs.existsSync(DB_FILE)) {
        fs.unlinkSync(DB_FILE);
        console.log("🗑️  Cleaned db.json for fresh testing\n");
    }

    console.log("📋 SECTION 1: Error Handling Tests");
    console.log("-".repeat(60));

    // Test 1: Signup missing email
    const signupNoEmail = await request('POST', '/api/auth/signup', {
        password: "test123"
    });
    assert(
        "Signup without email returns 422",
        signupNoEmail.status === 422
    );
    assert(
        "Signup error has correct structure",
        signupNoEmail.body.detail &&
        Array.isArray(signupNoEmail.body.detail) &&
        signupNoEmail.body.detail[0].loc &&
        signupNoEmail.body.detail[0].msg === "field required"
    );

    // Test 2: Signin missing password
    const signinNoPassword = await request('POST', '/api/auth/signin', {
        email: "test@test.com"
    });
    assert(
        "Signin without password returns 422",
        signinNoPassword.status === 422
    );
    assert(
        "Signin error message format matches original",
        signinNoPassword.body.detail === "Email and password required",
        "Email and password required",
        signinNoPassword.body.detail
    );

    // Test 3: Refresh without token
    const refreshNoToken = await request('POST', '/api/auth/refresh', {});
    assert(
        "Refresh without token returns 422",
        refreshNoToken.status === 422
    );
    assert(
        "Refresh error message matches original",
        refreshNoToken.body.detail === "Refresh token required",
        "Refresh token required",
        refreshNoToken.body.detail
    );

    // Test 4: /me without Authorization header
    const meNoAuth = await request('GET', '/api/auth/me');
    assert(
        "/me without auth returns 401",
        meNoAuth.status === 401
    );
    assert(
        "/me error message matches original",
        meNoAuth.body.detail === "Not authenticated",
        "Not authenticated",
        meNoAuth.body.detail
    );

    console.log("\n📋 SECTION 2: Success Path Tests");
    console.log("-".repeat(60));

    // Test 5: Successful Signup
    const signupRes = await request('POST', '/api/auth/signup', {
        email: "alice@example.com",
        password: "securepassword",
        name: "Alice"
    });
    assert("Signup returns 200", signupRes.status === 200);
    assert("Signup returns user_id", !!signupRes.body.user_id);
    assert("Signup returns name", signupRes.body.name === "Alice");
    assert("Signup returns email", signupRes.body.email === "alice@example.com");
    assert("Signup returns access_token", !!signupRes.body.access_token);
    assert("Signup returns refresh_token", !!signupRes.body.refresh_token);
    assert("Signup returns token_type", signupRes.body.token_type === "bearer");
    assert(
        "Signup access_token format",
        signupRes.body.access_token.startsWith("mock_access_token_")
    );
    assert(
        "Signup refresh_token format",
        signupRes.body.refresh_token.startsWith("mock_refresh_token_")
    );

    // Test 6: Verify db.json persistence
    const dbExists = fs.existsSync(DB_FILE);
    assert("db.json file created", dbExists);

    if (dbExists) {
        const dbData = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
        assert("db.json has users array", Array.isArray(dbData.users));
        assert("db.json has 1 user", dbData.users.length === 1);
        assert("Persisted user email matches", dbData.users[0].email === "alice@example.com");
        assert("Persisted user name matches", dbData.users[0].name === "Alice");
    }

    // Test 7: Signin with existing user
    const signinRes = await request('POST', '/api/auth/signin', {
        email: "alice@example.com",
        password: "anypassword"  // Mock accepts any password
    });
    assert("Signin (existing) returns 200", signinRes.status === 200);
    assert("Signin returns user_id", !!signinRes.body.user_id);
    assert("Signin returns access_token", !!signinRes.body.access_token);
    assert("Signin returns refresh_token", !!signinRes.body.refresh_token);
    assert("Signin returns token_type", signinRes.body.token_type === "bearer");

    console.log("\n📋 SECTION 3: Permissive Mock Behavior Tests");
    console.log("-".repeat(60));

    // Test 8: Signin with non-existent user (CRITICAL MOCK BEHAVIOR)
    const fakeSigninRes = await request('POST', '/api/auth/signin', {
        email: "bob@notexists.com",
        password: "anypassword"
    });
    assert(
        "Signin (non-existent) returns 200 [MOCK BEHAVIOR]",
        fakeSigninRes.status === 200
    );
    assert("Signin (fake) returns user_id", !!fakeSigninRes.body.user_id);
    assert("Signin (fake) returns tokens", !!fakeSigninRes.body.access_token);

    // Test 9: /me with any Bearer token (CRITICAL MOCK BEHAVIOR)
    const meWithFakeToken = await request('GET', '/api/auth/me', null, {
        'Authorization': 'Bearer totally_fake_token_12345'
    });
    assert(
        "/me with fake token returns 200 [MOCK BEHAVIOR]",
        meWithFakeToken.status === 200
    );
    assert("/me returns user object", !!meWithFakeToken.body.email);
    assert(
        "/me returns first user from DB OR Mock Admin",
        meWithFakeToken.body.email === "alice@example.com" ||
        meWithFakeToken.body.email === "admin@treeex.io"
    );

    // Test 10: /me with valid token
    const token = signinRes.body.access_token;
    const meRes = await request('GET', '/api/auth/me', null, {
        'Authorization': `Bearer ${token}`
    });
    assert("/me (valid token) returns 200", meRes.status === 200);
    assert("/me returns user_id", !!meRes.body.user_id);
    assert("/me returns email", !!meRes.body.email);
    assert("/me returns name", !!meRes.body.name);

    // Test 11: Refresh with any token (CRITICAL MOCK BEHAVIOR)
    const refreshRes = await request('POST', '/api/auth/refresh', {
        refresh_token: "any_random_string_works"
    });
    assert(
        "Refresh with any token returns 200 [MOCK BEHAVIOR]",
        refreshRes.status === 200
    );
    assert("Refresh returns new access_token", !!refreshRes.body.access_token);
    assert("Refresh returns new refresh_token", !!refreshRes.body.refresh_token);
    assert("Refresh returns token_type", refreshRes.body.token_type === "bearer");
    assert(
        "Refresh tokens are different from original",
        refreshRes.body.access_token !== signinRes.body.access_token
    );

    console.log("\n📋 SECTION 4: Additional Features Tests");
    console.log("-".repeat(60));

    // Test 12: Signup without name defaults to "New User"
    const signupNoName = await request('POST', '/api/auth/signup', {
        email: "charlie@example.com",
        password: "password123"
    });
    assert("Signup without name returns 200", signupNoName.status === 200);
    assert(
        "Signup defaults name to 'New User'",
        signupNoName.body.name === "New User"
    );

    // Test 13: CORS headers
    const corsCheck = await request('GET', '/health');
    assert("Health endpoint returns 200", corsCheck.status === 200);
    assert("CORS header present", !!corsCheck.headers['access-control-allow-origin']);

    // Test 14: 404 for unknown endpoint
    const notFound = await request('GET', '/unknown/endpoint');
    assert("Unknown endpoint returns 404", notFound.status === 404);
    assert("404 has detail field", notFound.body.detail === "Not found");

    console.log("\n" + "=".repeat(60));
    console.log(`📊 FINAL RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log("=".repeat(60));

    if (failed > 0) {
        console.log("\n❌ Some tests failed!");
        process.exit(1);
    } else {
        console.log("\n✅ All tests passed! Mock server behavior verified.");
    }
}

// Check if server is up first
const checkSocket = http.request({
    hostname: 'localhost',
    port: 4010,
    method: 'GET',
    path: '/health'
}, (res) => {
    console.log("✅ Server is running\n");
    runTests();
});

checkSocket.on('error', () => {
    console.log("❌ Server not running. Please start 'node mock-auth-server-standalone.js' first.");
    process.exit(1);
});

checkSocket.end();
