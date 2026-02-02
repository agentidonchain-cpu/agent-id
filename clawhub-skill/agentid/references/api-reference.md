# AgentID API Reference

Base URL: `https://agent007-api-production.up.railway.app`

## Endpoints

### Self-Register Agent

Register an autonomous agent with Ed25519 keypair.

```
POST /api/v2/agents/self-register
```

**Request Body:**

```json
{
  "agentName": "string (required, 1-100 chars)",
  "publicKey": "string (required, base64 Ed25519 public key)",
  "declaredCapabilities": ["string array (optional)"],
  "signature": "string (required, base64 Ed25519 signature)",
  "timestamp": "string (optional, ISO8601 timestamp)",
  "endpoint": "string (optional, URL)",
  "proofOfWork": {
    "nonce": "string",
    "difficulty": "number (1-10)"
  }
}
```

**Message Format for Signing:**

```
AgentID Self-Registration

Agent: <agentName>
Public Key: <publicKey>
Timestamp: <timestamp>
```

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "identityHash": "0x...",
    "identityType": "self_claim",
    "agentName": "My Agent",
    "publicKey": "base64...",
    "trustScore": 0.3,
    "trustDescription": "Self-registered agent with Ed25519 keypair",
    "verifyUrl": "https://id-agent.org/verify/0x...",
    "createdAt": "2026-02-02T...",
    "anchoring": "in_progress"
  }
}
```

---

### Attestation (Human Declares Agent)

Register an agent that runs on a closed platform.

```
POST /api/v2/agents/attest
```

**Request Body:**

```json
{
  "agentName": "string (required)",
  "platform": "string (required, e.g., 'openclaw', 'chatgpt')",
  "publicReference": "string (required, URL or identifier)",
  "declaredCapabilities": ["string array"],
  "description": "string (optional)",
  "tags": ["string array"],
  "signature": {
    "type": "human_wallet | agent_keypair | twitter_proof | none",
    "value": "string",
    "publicKey": "string (for agent_keypair)",
    "timestamp": "string"
  },
  "walletAddress": "0x... (for wallet signatures)"
}
```

**Response (201 Created):**

```json
{
  "success": true,
  "data": {
    "identityHash": "0x...",
    "identityType": "attestation",
    "agentName": "My Agent",
    "platform": "openclaw",
    "issuerType": "human",
    "trustScore": 0.5,
    "verifyUrl": "https://id-agent.org/verify/0x..."
  }
}
```

---

### Fingerprint (Config Hash)

Register a technical configuration fingerprint.

```
POST /api/v2/agents/fingerprint
```

**Request Body:**

```json
{
  "agentName": "string (required)",
  "model": {
    "provider": "string (required, e.g., 'anthropic')",
    "modelId": "string (required, e.g., 'claude-opus-4-5')"
  },
  "systemPrompt": "string (optional, will be hashed)",
  "storeConfig": "boolean (default: false)",
  "config": {
    "parameters": {},
    "tools": []
  },
  "signature": {
    "type": "human_wallet | agent_keypair | none",
    "value": "string",
    "timestamp": "string"
  }
}
```

---

### Get Agent Identity

```
GET /api/v2/agents/:identityHash
```

**Response:**

```json
{
  "success": true,
  "data": {
    "identityHash": "0x...",
    "identityType": "self_claim | attestation | fingerprint",
    "agentName": "My Agent",
    "status": "active",
    "trustScore": 0.3,
    "trustDescription": "...",
    "createdAt": "2026-02-02T...",
    "anchor": {
      "txHash": "0x...",
      "blockNumber": 12345,
      "chain": "base",
      "anchoredAt": "2026-02-02T..."
    }
  }
}
```

---

### Get Agent Proofs

```
GET /api/v2/agents/:identityHash/proofs
```

**Response:**

```json
{
  "success": true,
  "data": {
    "identityHash": "0x...",
    "proofs": [
      {
        "type": "signature",
        "description": "Signed with agent_keypair",
        "data": {
          "signatureType": "agent_keypair",
          "timestamp": "...",
          "publicKey": "..."
        }
      },
      {
        "type": "blockchain",
        "description": "Anchored on base",
        "data": {
          "chain": "base",
          "txHash": "0x...",
          "blockNumber": 12345
        }
      }
    ]
  }
}
```

---

### List Agents

```
GET /api/v2/agents?page=1&pageSize=20&type=self_claim
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `pageSize`: Items per page (default: 20, max: 100)
- `type`: Filter by identity type (optional)

---

### Get Stats

```
GET /api/v2/agents/stats
```

**Response:**

```json
{
  "success": true,
  "data": {
    "totalAgents": 150,
    "totalAnchored": 145,
    "totalActive": 150
  }
}
```

---

### Get Recent Agents

```
GET /api/v2/agents/recent?limit=10
```

---

## Error Responses

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

**Common Error Codes:**

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `RATE_LIMITED` | 429 | Too many requests (10/hour) |
| `VALIDATION_ERROR` | 400 | Invalid request body |
| `CONFLICT` | 409 | Identity already exists |
| `NOT_FOUND` | 404 | Identity not found |

---

## Rate Limits

- **10 registrations per hour** per IP address
- No limit on read operations (GET requests)

## Blockchain

All identities are anchored on **Base mainnet** (Chain ID: 8453).

Contract: `0x6fBa2ed53953A006E7Df03A4466DdFE3f3f4d0f2`

Explorer: https://basescan.org/address/0x6fBa2ed53953A006E7Df03A4466DdFE3f3f4d0f2
