# API Reference

The AgentID API provides REST endpoints for registering agents, managing identities, and performing verification.

## Base URL

```
https://api.agentid.xyz/api/v1
```

## Authentication

Most endpoints require an API key:

```bash
Authorization: Bearer agent007_your_api_key_here
```

### Getting an API Key

API keys are generated upon registration. Contact support for access.

### Public Endpoints

These endpoints do not require authentication:

- `GET /agents/:hash` - Get agent identity
- `GET /agents/:hash/verify` - Verify identity
- `GET /agents` - List agents

## Response Format

All responses follow this format:

```json
{
  "success": true,
  "data": { ... },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

### Error Response

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request body",
    "details": { ... }
  },
  "meta": {
    "requestId": "uuid",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

## Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `UNAUTHORIZED` | 401 | Missing or invalid API key |
| `NOT_FOUND` | 404 | Resource not found |
| `CONFLICT` | 409 | Resource already exists |
| `RATE_LIMITED` | 429 | Too many requests |
| `INTERNAL_ERROR` | 500 | Server error |

## Rate Limits

| Endpoint Type | Limit |
|---------------|-------|
| Public (GET) | 100/minute |
| Authenticated | 1000/minute |
| Registration | 10/minute |

Rate limit headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1705312260
```

## Endpoints Overview

### Core

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agents/register` | Register new agent |
| POST | `/agents/validate` | Validate challenge responses |
| GET | `/agents/:hash` | Get agent details |
| GET | `/agents/:hash/verify` | Verify identity |
| GET | `/agents` | List agents |

### Behavioral Analysis

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agents/:hash/samples` | Submit response samples |
| GET | `/agents/:hash/autonomy` | Get autonomy analysis |
| GET | `/agents/:hash/fingerprint` | Get behavioral fingerprint |

### Attestation

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agents/:hash/attestations` | Create attestation |
| GET | `/agents/:hash/certificate` | Get certificate |
| POST | `/agents/:hash/certificate/verify` | Verify certificate |

### Continuous Verification

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/agents/:hash/verification/schedule` | Schedule verification |
| GET | `/agents/:hash/verification/status` | Get status |
| POST | `/agents/:hash/verification/run` | Run verification |
| POST | `/agents/:hash/verification/pause` | Pause verification |
| POST | `/agents/:hash/verification/resume` | Resume verification |
| GET | `/agents/:hash/verification/history` | Get history |
| GET | `/agents/:hash/verification/alerts` | Get alerts |
| PUT | `/agents/:hash/verification/baseline` | Update baseline |

## SDKs

### JavaScript/TypeScript

```bash
npm install @agentid/sdk
```

```typescript
import { AgentID } from '@agentid/sdk';

const client = new AgentID({
  apiKey: 'agent007_your_api_key'
});

// Register agent
const result = await client.register({
  systemPrompt: '...',
  model: { ... },
  parameters: { ... }
});

// Verify
const valid = await client.verify(identityHash);
```

### Python

```bash
pip install agentid
```

```python
from agentid import AgentID

client = AgentID(api_key='agent007_your_api_key')

# Register agent
result = client.register(
    system_prompt='...',
    model={...},
    parameters={...}
)

# Verify
valid = client.verify(identity_hash)
```

## Webhooks

AgentID can send webhooks for events:

### Events

| Event | Description |
|-------|-------------|
| `identity.anchored` | Identity anchored on-chain |
| `identity.revoked` | Identity was revoked |
| `verification.failed` | Verification check failed |
| `verification.alert` | New alert generated |

### Payload

```json
{
  "event": "verification.failed",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "data": {
    "identityHash": "0x7a8b9c0d...",
    "checkType": "behavioral_drift",
    "score": 0.45,
    "threshold": 0.70
  },
  "signature": "sha256=..."
}
```

### Verifying Signatures

```javascript
const crypto = require('crypto');

function verifyWebhook(payload, signature, secret) {
  const expected = 'sha256=' + crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expected)
  );
}
```

## Testing

### Sandbox Environment

```
https://sandbox.api.agentid.xyz/api/v1
```

Use test API keys prefixed with `agent007_test_`.

### Mock Responses

Add header for predictable responses:

```
X-AgentID-Mock: success
X-AgentID-Mock: validation_error
X-AgentID-Mock: not_found
```

## Detailed Endpoints

See [Endpoints](endpoints.md) for complete documentation of each endpoint.

## Support

- **Documentation**: https://docs.agentid.xyz
- **Status Page**: https://status.agentid.xyz
- **Support Email**: support@agentid.xyz
- **Discord**: https://discord.gg/agentid
