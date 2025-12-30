const http = require('http');

// Simple test to check each endpoint
async function makeRequest(method, path, body = null, headers = {}) {
    return new Promise((resolve) => {
        const options = {
            hostname: 'localhost',
            port: 4010,
            path,
            method,
            headers: { 'Content-Type': 'application/json', ...headers }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                console.log(`${method} ${path} => ${res.statusCode}`);
                console.log('Response:', data);
                console.log('---');
                resolve({ status: res.statusCode, body: data ? JSON.parse(data) : {} });
            });
        });

        req.on('error', (e) => {
            console.error(`Error: ${e.message}`);
            resolve({ status: 500, body: {} });
        });

        if (body) req.write(JSON.stringify(body));
        req.end();
    });
}

async function test() {
    console.log("Testing each endpoint...\n");

    // 1. Signup missing field
    console.log("TEST 1: Signup without email");
    await makeRequest('POST', '/api/auth/signup', { password: "test" });

    // 2. Signin missing field
    console.log("\nTEST 2: Signin without password");
    await makeRequest('POST', '/api/auth/signin', { email: "test@test.com" });

    // 3. Successful signup
    console.log("\nTEST 3: Successful signup");
    const signup = await makeRequest('POST', '/api/auth/signup', {
        email: "test@example.com",
        password: "password123",
        name: "Test User"
    });

    // 4. Signin with existing user
    console.log("\nTEST 4: Signin (existing user)");
    await makeRequest('POST', '/api/auth/signin', {
        email: "test@example.com",
        password: "anything"
    });

    // 5. Signin with non-existent user
    console.log("\nTEST 5: Signin (non-existent user - should PASS)");
    await makeRequest('POST', '/api/auth/signin', {
        email: "fake@fake.com",
        password: "anything"
    });

    // 6. /me without auth
    console.log("\nTEST 6: /me without authorization");
    await makeRequest('GET', '/api/auth/me');

    // 7. /me with fake token
    console.log("\nTEST 7: /me with fake token (should PASS)");
    await makeRequest('GET', '/api/auth/me', null, {
        'Authorization': 'Bearer fake_token_12345'
    });

    // 8. Refresh without token
    console.log("\nTEST 8: Refresh without token");
    await makeRequest('POST', '/api/auth/refresh', {});

    // 9. Refresh with any token
    console.log("\nTEST 9: Refresh with any token (should PASS)");
    await makeRequest('POST', '/api/auth/refresh', { refresh_token: "anything" });
}

test().catch(console.error);
