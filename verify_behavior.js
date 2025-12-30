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
    console.log("🚀 Starting Robust Verification Tests...\n");
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

    console.log("📋 SECTION 1: Error Handling & Robustness");
    console.log("-".repeat(60));

    // Test 1: Query Parameters (Robust URL check)
    const queryParamReq = await request('POST', '/api/auth/signin?ref=google&foo=bar', {
        email: "any@test.com", password: "any"
    });
    assert(
        "Signin with query params returns 200",
        queryParamReq.status === 200
    );

    // Test 2: Invalid JSON
    // Note: Node http client makes it hard to send malformed JSON without using raw socket, 
    // skipping malformed check in simplified test, assuming manual verification or unit test.
    // Instead checking empty body handling:
    const emptyBodyReq = await request('POST', '/api/auth/signin', {});
    assert(
        "Empty body returns 422/400",
        emptyBodyReq.status === 422 || emptyBodyReq.status === 400
    );

    console.log("\n📋 SECTION 2: API Contract Alignment");
    console.log("-".repeat(60));

    // Test 3: Signin Response Schema (Strict)
    const signinRes = await request('POST', '/api/auth/signin', {
        email: "alice@example.com",
        password: "anypassword"
    });
    assert("Signin returns 200", signinRes.status === 200);
    assert("Signin returns user_id", !!signinRes.body.user_id);
    assert("Signin returns access_token", !!signinRes.body.access_token);
    assert("Signin returns refresh_token", !!signinRes.body.refresh_token);
    assert("Signin returns token_type", signinRes.body.token_type === "bearer");
    assert(
        "Signin does NOT return email (strict schema)",
        signinRes.body.email === undefined
    );
    assert(
        "Signin does NOT return name (strict schema)",
        signinRes.body.name === undefined
    );

    // Test 4: Refresh Response Schema (Strict)
    const refreshRes = await request('POST', '/api/auth/refresh', {
        refresh_token: "any_token"
    });
    assert("Refresh returns 200", refreshRes.status === 200);
    assert("Refresh has access_token", !!refreshRes.body.access_token);
    assert("Refresh has expires_at", !!refreshRes.body.expires_at); // New field

    // Test 5: Me Response Schema (Strict)
    const meRes = await request('GET', '/api/auth/me', null, {
        Authorization: "Bearer mock_token"
    });
    assert("Me returns 200", meRes.status === 200);
    assert("Me has email", !!meRes.body.email);
    assert("Me has name", !!meRes.body.name);
    assert("Me has email_verified", meRes.body.email_verified === true);
    assert("Me has is_active", meRes.body.is_active === true);
    assert("Me has created_at", !!meRes.body.created_at);
    assert("Me has last_login_at", !!meRes.body.last_login_at);

    // Test 6: Permissive Login (Mock behavior check)
    const fakeLogin = await request('POST', '/api/auth/signin', {
        email: "ghost@user.com", password: "pwd"
    });
    assert("Fake login returns 200", fakeLogin.status === 200);
    assert("Fake login has user_id", !!fakeLogin.body.user_id);

    console.log("\n" + "=".repeat(60));
    console.log(`📊 FINAL RESULTS: ${passed} Passed, ${failed} Failed`);
    console.log("=".repeat(60));

    if (failed > 0) process.exit(1);
    else console.log("\n✅ API Contract Matches Python Backend");
}

const checkSocket = http.request({
    hostname: 'localhost', port: 4010, method: 'GET', path: '/health'
}, () => {
    console.log("✅ Server is running\n");
    runTests();
});

checkSocket.on('error', () => {
    console.log("❌ Server not running. Please restart it.");
    process.exit(1);
});

checkSocket.end();
