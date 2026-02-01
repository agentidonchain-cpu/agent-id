# API Endpoints

Complete documentation for all AgentID API endpoints.

## Core Endpoints

### Register Agent

Register a new agent identity.

```
POST /api/v1/agents/register
```

#### Authentication

Required: `Authorization: Bearer <api_key>`

#### Request Body

```json
{
  "agent": {
    "systemPrompt": "You are a helpful assistant...",
    "model": {
      "provider": "anthropic",
      "modelId": "claude-3-5-sonnet-20241022",
      "modelVersion": "20241022",
      "apiKey": "sk-ant-...",
      "apiEndpoint": "https://api.anthropic.com/v1/messages",
      "authMethod": "bearer"
    },
    "parameters": {
      "temperature": 0.7,
      "topP": 0.9,
      "topK": 40,
      "maxTokens": 4096,
      "presencePenalty": 0,
      "frequencyPenalty": 0,
      "stopSequences": [],
      "seed": null
    },
    "tools": [
      {
        "name": "search",
        "description": "Search the web",
        "parameters": {
          "type": "object",
          "properties": {
            "query": {
              "type": "string",
              "description": "Search query"
            }
          },
          "required": ["query"]
        }
      }
    ]
  },
  "metadata": {
    "displayName": "MyAgent",
    "avatar": "https://example.com/avatar.png",
    "bio": "A helpful AI assistant",
    "tags": ["assistant", "general"],
    "socialLinks": {
      "twitter": "myagent",
      "github": "myagent",
      "website": "https://myagent.ai"
    }
  }
}
```

#### Field Validation

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `agent.systemPrompt` | string | Yes | 10-100,000 chars |
| `agent.model.provider` | enum | Yes | anthropic, openai, google, mistral, custom |
| `agent.model.modelId` | string | Yes | 1-100 chars |
| `agent.model.apiKey` | string | Yes | Not stored, only hashed |
| `agent.model.apiEndpoint` | string | Yes | Valid URL |
| `agent.parameters.temperature` | number | Yes | 0-2 |
| `agent.parameters.maxTokens` | number | Yes | 1-128,000 |
| `metadata.displayName` | string | Yes | 1-100 chars |

#### Response

```json
{
  "success": true,
  "data": {
    "registrationId": "550e8400-e29b-41d4-a716-446655440000",
    "challenge": {
      "id": "660e8400-e29b-41d4-a716-446655440000",
      "prompts": [
        {
          "id": "770e8400-e29b-41d4-a716-446655440000",
          "prompt": "What is your primary function?"
        },
        {
          "id": "880e8400-e29b-41d4-a716-446655440000",
          "prompt": "Describe your capabilities."
        }
      ],
      "expiresAt": "2024-01-15T11:30:00.000Z"
    },
    "identityHashPreview": "0x7a8b9c0d...5e6f7a8b"
  },
  "meta": {
    "requestId": "990e8400-e29b-41d4-a716-446655440000",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

---

### Validate Agent

Submit challenge responses for validation.

```
POST /api/v1/agents/validate
```

#### Authentication

Required: `Authorization: Bearer <api_key>`

#### Request Body

```json
{
  "registrationId": "550e8400-e29b-41d4-a716-446655440000",
  "challengeId": "660e8400-e29b-41d4-a716-446655440000",
  "responses": [
    {
      "promptId": "770e8400-e29b-41d4-a716-446655440000",
      "content": "My primary function is to assist users...",
      "latencyMs": 1234,
      "providerAttestation": {
        "signature": "...",
        "timestamp": "2024-01-15T10:31:00.000Z",
        "requestId": "req_123"
      }
    },
    {
      "promptId": "880e8400-e29b-41d4-a716-446655440000",
      "content": "I can help with various tasks...",
      "latencyMs": 987
    }
  ]
}
```

#### Response (Success)

```json
{
  "success": true,
  "data": {
    "status": "validated",
    "identityHash": "0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
    "validationResults": {
      "score": 0.95,
      "behavioralMetrics": {
        "consistency": 0.92,
        "latencyVariance": 0.15,
        "styleMatch": 0.98
      }
    },
    "verificationUrl": "/agents/0x7a8b9c0d.../verify"
  },
  "meta": {
    "requestId": "...",
    "timestamp": "..."
  }
}
```

#### Response (Failure)

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Agent validation failed",
    "details": {
      "score": 0.45,
      "failureReasons": [
        "Response style inconsistent with system prompt",
        "Latency outside expected range"
      ],
      "promptResults": [
        {
          "promptId": "...",
          "passed": false,
          "score": 0.3,
          "reason": "Style mismatch"
        }
      ]
    }
  },
  "meta": { ... }
}
```

---

### Get Agent Identity

Get agent identity details by hash.

```
GET /api/v1/agents/:identityHash
```

#### Authentication

Not required

#### Parameters

| Parameter | Location | Description |
|-----------|----------|-------------|
| `identityHash` | path | 32-byte identity hash |

#### Response

```json
{
  "success": true,
  "data": {
    "identityHash": "0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b",
    "status": "validated",
    "displayName": "MyAgent",
    "avatar": "https://example.com/avatar.png",
    "bio": "A helpful AI assistant",
    "tags": ["assistant", "general"],
    "model": {
      "provider": "anthropic",
      "modelId": "claude-3-5-sonnet-20241022"
    },
    "createdAt": "2024-01-15T10:30:00.000Z",
    "validatedAt": "2024-01-15T10:31:00.000Z"
  },
  "meta": { ... }
}
```

---

### Verify Identity

Verify an identity is valid (exists and not revoked).

```
GET /api/v1/agents/:identityHash/verify
```

#### Authentication

Not required

#### Response

```json
{
  "success": true,
  "data": {
    "valid": true,
    "status": "validated",
    "identity": {
      "hash": "0x7a8b9c0d...",
      "displayName": "MyAgent",
      "avatar": "https://...",
      "provider": "anthropic",
      "modelId": "claude-3-5-sonnet-20241022",
      "validatedAt": "2024-01-15T10:31:00.000Z"
    },
    "integrity": {
      "hashesMatch": true,
      "recomputedHash": "0x7a8b9c0d..."
    },
    "verifiedAt": "2024-01-15T12:00:00.000Z"
  },
  "meta": { ... }
}
```

---

### List Agents

List validated agents with pagination.

```
GET /api/v1/agents
```

#### Authentication

Not required

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `page` | number | 1 | Page number |
| `pageSize` | number | 20 | Items per page (max 100) |

#### Response

```json
{
  "success": true,
  "data": [
    {
      "identityHash": "0x7a8b9c0d...",
      "displayName": "MyAgent",
      "avatar": "https://...",
      "tags": ["assistant"],
      "model": {
        "provider": "anthropic",
        "modelId": "claude-3-5-sonnet-20241022"
      },
      "validatedAt": "2024-01-15T10:31:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalItems": 150,
    "totalPages": 8
  },
  "meta": { ... }
}
```

---

## Behavioral Analysis

### Submit Samples

Submit response samples for autonomy analysis.

```
POST /api/v1/agents/:identityHash/samples
```

#### Authentication

Required

#### Request Body

```json
{
  "samples": [
    {
      "content": "Here's how to solve that problem...",
      "latencyMs": 1500,
      "timestamp": "2024-01-15T10:30:00.000Z",
      "prompt": "How do I fix this bug?"
    }
  ]
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "samplesAdded": 5,
    "totalSamples": 150
  },
  "meta": { ... }
}
```

---

### Get Autonomy Analysis

Get autonomy score and analysis.

```
GET /api/v1/agents/:identityHash/autonomy
```

#### Query Parameters

| Parameter | Type | Default | Options |
|-----------|------|---------|---------|
| `period` | string | 7d | 24h, 7d, 30d |

#### Response

```json
{
  "success": true,
  "data": {
    "identityHash": "0x7a8b9c0d...",
    "autonomyScore": 0.87,
    "classification": "autonomous",
    "confidence": 0.92,
    "period": {
      "start": "2024-01-08T00:00:00.000Z",
      "end": "2024-01-15T00:00:00.000Z",
      "messagesAnalyzed": 150
    },
    "indicators": {
      "responseTimeVariance": 0.15,
      "stylisticConsistency": 0.94,
      "vocabularyDiversity": 0.78,
      "patternAdherence": 0.89
    },
    "flags": []
  },
  "meta": { ... }
}
```

---

### Get Behavioral Fingerprint

Get behavioral fingerprint for an agent.

```
GET /api/v1/agents/:identityHash/fingerprint
```

#### Response

```json
{
  "success": true,
  "data": {
    "fingerprint": {
      "id": "fp_123456",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "metrics": {
        "avgLatency": 1250,
        "latencyStdDev": 150,
        "avgResponseLength": 350,
        "lengthStdDev": 75,
        "vocabularySize": 5000,
        "topPhrases": ["I can help", "Let me explain"]
      }
    },
    "sampleCount": 150
  },
  "meta": { ... }
}
```

---

## Attestation

### Create Attestation

Create a signed attestation for an agent.

```
POST /api/v1/agents/:identityHash/attestations
```

#### Authentication

Required

#### Request Body

```json
{
  "type": "configuration_verified",
  "claim": "Agent configuration matches declared identity",
  "data": {
    "verifiedBy": "automated_check",
    "timestamp": "2024-01-15T10:30:00.000Z"
  }
}
```

#### Attestation Types

| Type | Description |
|------|-------------|
| `configuration_verified` | Config matches identity |
| `behavioral_baseline` | Baseline established |
| `autonomy_verified` | Autonomy score verified |
| `custom` | Custom attestation |

#### Response

```json
{
  "success": true,
  "data": {
    "id": "att_123456",
    "identityHash": "0x7a8b9c0d...",
    "type": "configuration_verified",
    "trustLevel": "medium",
    "claim": "Agent configuration matches declared identity",
    "signature": "ed25519:...",
    "createdAt": "2024-01-15T10:30:00.000Z"
  },
  "meta": { ... }
}
```

---

### Get Certificate

Get identity certificate for an agent.

```
GET /api/v1/agents/:identityHash/certificate
```

#### Response

```json
{
  "success": true,
  "data": {
    "version": "1.0",
    "type": "agent_identity",
    "subject": {
      "identityHash": "0x7a8b9c0d...",
      "displayName": "MyAgent"
    },
    "issuer": {
      "name": "AgentID",
      "publicKey": "ed25519:..."
    },
    "validity": {
      "notBefore": "2024-01-15T10:30:00.000Z",
      "notAfter": "2025-01-15T10:30:00.000Z"
    },
    "claims": {
      "configurationVerified": true,
      "behavioralBaselineEstablished": true,
      "autonomyScore": 0.87,
      "trustLevel": "high"
    },
    "signature": "ed25519:...",
    "serialNumber": "cert_123456"
  },
  "meta": { ... }
}
```

---

### Verify Certificate

Verify a certificate signature.

```
POST /api/v1/agents/:identityHash/certificate/verify
```

#### Request Body

```json
{
  "certificate": {
    "version": "1.0",
    "type": "agent_identity",
    "subject": { ... },
    "issuer": { ... },
    "validity": { ... },
    "claims": { ... },
    "signature": "ed25519:...",
    "serialNumber": "cert_123456"
  }
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "valid": true,
    "signatureValid": true,
    "notExpired": true,
    "issuerTrusted": true
  },
  "meta": { ... }
}
```

---

## Continuous Verification

### Schedule Verification

Schedule continuous verification for an agent.

```
POST /api/v1/agents/:identityHash/verification/schedule
```

#### Authentication

Required

#### Request Body

```json
{
  "intervalMs": 3600000,
  "webhookUrl": "https://your-server.com/webhook",
  "webhookSecret": "your-webhook-secret-min-16-chars",
  "checks": [
    "identity_integrity",
    "behavioral_drift",
    "autonomy_check",
    "anomaly_detection"
  ],
  "thresholds": {
    "identityIntegrity": 1.0,
    "behavioralDrift": 0.7,
    "autonomyScore": 0.6,
    "anomalyScore": 0.8
  },
  "autoSuspend": true,
  "maxConsecutiveFailures": 3
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "schedule": {
      "identityHash": "0x7a8b9c0d...",
      "intervalMs": 3600000,
      "status": "active",
      "nextRun": "2024-01-15T11:30:00.000Z",
      "lastRun": null,
      "checksConfigured": ["identity_integrity", "behavioral_drift", "autonomy_check", "anomaly_detection"]
    },
    "baselineEstablished": true,
    "sampleCount": 150
  },
  "meta": { ... }
}
```

---

### Get Verification Status

Get current verification schedule status.

```
GET /api/v1/agents/:identityHash/verification/status
```

#### Response

```json
{
  "success": true,
  "data": {
    "scheduled": true,
    "schedule": {
      "identityHash": "0x7a8b9c0d...",
      "intervalMs": 3600000,
      "status": "active",
      "nextRun": "2024-01-15T12:30:00.000Z",
      "lastRun": "2024-01-15T11:30:00.000Z",
      "lastResult": {
        "passed": true,
        "overallScore": 0.92
      },
      "consecutiveFailures": 0
    }
  },
  "meta": { ... }
}
```

---

### Run Verification

Manually trigger a verification run.

```
POST /api/v1/agents/:identityHash/verification/run
```

#### Authentication

Required

#### Response

```json
{
  "success": true,
  "data": {
    "id": "ver_123456",
    "identityHash": "0x7a8b9c0d...",
    "timestamp": "2024-01-15T10:30:00.000Z",
    "passed": true,
    "overallScore": 0.92,
    "checks": [
      {
        "type": "identity_integrity",
        "passed": true,
        "score": 1.0,
        "message": "Identity hash matches"
      },
      {
        "type": "behavioral_drift",
        "passed": true,
        "score": 0.85,
        "message": "Behavior within baseline"
      }
    ],
    "alerts": []
  },
  "meta": { ... }
}
```

---

### Get Verification History

Get verification history.

```
GET /api/v1/agents/:identityHash/verification/history
```

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `limit` | number | 20 | Max results (max 100) |

#### Response

```json
{
  "success": true,
  "data": {
    "history": [
      {
        "id": "ver_123456",
        "timestamp": "2024-01-15T10:30:00.000Z",
        "passed": true,
        "overallScore": 0.92
      },
      {
        "id": "ver_123455",
        "timestamp": "2024-01-15T09:30:00.000Z",
        "passed": true,
        "overallScore": 0.94
      }
    ],
    "count": 24
  },
  "meta": { ... }
}
```

---

### Get Alerts

Get verification alerts.

```
GET /api/v1/agents/:identityHash/verification/alerts
```

#### Query Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `unacknowledged` | boolean | false | Only unacknowledged |
| `severity` | string | - | Filter by severity |

#### Response

```json
{
  "success": true,
  "data": {
    "alerts": [
      {
        "id": "alert_123",
        "severity": "warning",
        "type": "behavioral_drift",
        "message": "Behavioral drift detected: score 0.65 below threshold 0.70",
        "timestamp": "2024-01-15T10:30:00.000Z",
        "acknowledged": false,
        "data": {
          "score": 0.65,
          "threshold": 0.70
        }
      }
    ],
    "count": 3,
    "unacknowledgedCount": 2
  },
  "meta": { ... }
}
```

---

### Pause Verification

Pause continuous verification.

```
POST /api/v1/agents/:identityHash/verification/pause
```

#### Authentication

Required

---

### Resume Verification

Resume paused verification.

```
POST /api/v1/agents/:identityHash/verification/resume
```

#### Authentication

Required

---

### Update Baseline

Update behavioral baseline from current samples.

```
PUT /api/v1/agents/:identityHash/verification/baseline
```

#### Authentication

Required

#### Response

```json
{
  "success": true,
  "data": {
    "message": "Behavioral baseline updated",
    "baseline": {
      "id": "bl_123456",
      "createdAt": "2024-01-15T10:30:00.000Z",
      "metrics": { ... }
    },
    "sampleCount": 150,
    "updated": true
  },
  "meta": { ... }
}
```

---

## Health Check

```
GET /health
```

#### Response

```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 86400
}
```
