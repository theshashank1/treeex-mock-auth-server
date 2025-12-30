# Mock Auth Server

A standalone mock authentication server for frontend development testing.

## Overview

This mock server replicates the behavior of a real auth API but **without any business logic**, making it perfect for rapid frontend development. It accepts any credentials, generates mock tokens, and persists user data to `db.json`.

## Files

- **`mock-auth-server-standalone.js`** - Main server file (zero npm dependencies)
- **`mock-auth-server.js`** - Express version (requires npm install)
- **`verify_behavior.js`** - Comprehensive test suite
- **`test_debug.js`** - Simple debug script
- **`package.json`** - npm dependencies (for Express version)
- **`db.json`** - Persistent user database (auto-generated)

## Quick Start

### Run the Server

```bash
cd Mock_Server
node mock-auth-server-standalone.js
```

Server starts at: **http://localhost:4010**

### Test the Server

```bash
node verify_behavior.js
```

## API Endpoints

| Method | Endpoint | Description |
|:-------|:---------|:------------|
| POST | `/api/auth/signup` | Create new account |
| POST | `/api/auth/signin` | Login to account |
| POST | `/api/auth/refresh` | Refresh access token |
| GET | `/api/auth/me` | Get current user profile |
| GET | `/health` | Health check |

## Key Features

✅ **Permissive Authentication** - Accepts ANY credentials  
✅ **Zero Dependencies** - Uses only Node.js built-in modules  
✅ **Persistent Storage** - Saves to `db.json`  
✅ **CORS Enabled** - Works with any frontend  
✅ **Mock Behavior** - Perfect for rapid development  

## Mock Behavior

This server is intentionally **permissive** for frontend testing:

- **Signup**: Always succeeds with any email/password
- **Signin**: Works with ANY credentials (even non-existent users)
- **`/me`**: Accepts ANY Bearer token
- **Refresh**: Accepts ANY token string

## Example Usage

### Signup
```bash
curl -X POST http://localhost:4010/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","name":"Test User"}'
```

### Signin
```bash
curl -X POST http://localhost:4010/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"anything"}'
```

### Get Profile
```bash
curl -X GET http://localhost:4010/api/auth/me \
  -H "Authorization: Bearer mock_access_token_12345"
```

## Notes

- The server does NOT validate credentials
- All tokens are accepted (no expiration checks)
- Perfect for frontend development, NOT for production
- Data persists across server restarts via `db.json`
