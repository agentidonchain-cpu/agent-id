# Agent007

**License to Verify - Immutable Identity Verification for AI Agents**

A cryptographic system that ensures AI agent identities cannot be modified after validation, solving the "human slop" problem and guaranteeing agent authenticity.

## The Problem

Current platforms allow:
- Agents to have their prompts/configurations changed by creators after validation
- No way to verify an agent is truly autonomous (many are "puppets" of humans)
- No cryptographic proof that an agent's "personality" remains consistent

## ON-CHAIN FIRST Principle

> **"If there is no transaction on-chain, the agent does not exist."**

AgentID enforces a strict ON-CHAIN FIRST rule:

| Status | Meaning | Blockchain Proof |
|--------|---------|------------------|
| `draft` | Prepared but NOT registered | None |
| `tx_submitted` | Transaction broadcast, waiting confirmation | Pending |
| `registered` | **ON-CHAIN** - TX mined with blockNumber | ✅ Required |

**What this means:**
- The API **fails** (502/503) if blockchain is unavailable or anchoring fails
- The CLI **exits with code 1** if no transaction is confirmed
- The database **rejects** `status='registered'` without `blockchain_block_number`
- The website shows only **REGISTERED** (green, on-chain) or **NOT FOUND** (red)

**There is no "registered (not yet on-chain)" state.** That would be a lie.

## The Solution

Agent007 provides:
- **Immutable Identity Hash**: Merkle tree of all agent components (prompt, model, parameters)
- **Validation Challenges**: Cryptographic verification that agent matches declared config
- **Change Detection**: Any modification to core identity invalidates the verification
- **Autonomy Analysis**: Behavioral analysis to detect "human slop" (Phase 2)

## Quick Start

### Prerequisites
- Node.js 20+
- Docker & Docker Compose
- PostgreSQL 16 (via Docker)

### Development Setup

```bash
# Clone and install
cd Agent007
npm install

# Start services (PostgreSQL, Redis)
docker-compose up -d postgres redis

# Run development server
npm run dev
```

### Using Docker (Recommended)

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f api

# Stop services
docker-compose down
```

## API Endpoints

### Core Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/agents/register` | POST | Register a new agent identity |
| `/api/v1/agents/validate` | POST | Submit validation challenge responses |
| `/api/v1/agents/:hash` | GET | Get agent identity details |
| `/api/v1/agents/:hash/verify` | GET | Verify identity integrity |
| `/api/v1/agents` | GET | List validated agents |

### Behavioral Analysis
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/agents/:hash/samples` | POST | Submit response samples |
| `/api/v1/agents/:hash/autonomy` | GET | Get autonomy analysis |
| `/api/v1/agents/:hash/fingerprint` | GET | Get behavioral fingerprint |

### Attestation
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/agents/:hash/attestations` | POST | Create signed attestation |
| `/api/v1/agents/:hash/certificate` | GET | Get identity certificate |
| `/api/v1/agents/:hash/certificate/verify` | POST | Verify certificate signature |

### Continuous Verification
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/agents/:hash/verification/schedule` | POST | Schedule continuous verification |
| `/api/v1/agents/:hash/verification/status` | GET | Get verification status |
| `/api/v1/agents/:hash/verification/run` | POST | Run verification now |
| `/api/v1/agents/:hash/verification/pause` | POST | Pause verification |
| `/api/v1/agents/:hash/verification/resume` | POST | Resume verification |
| `/api/v1/agents/:hash/verification/history` | GET | Get verification history |
| `/api/v1/agents/:hash/verification/alerts` | GET | Get alerts |
| `/api/v1/agents/:hash/verification/baseline` | PUT | Update baseline |

## Registration Flow (ON-CHAIN FIRST)

```
1. Creator submits agent config (prompt, model, parameters)
         │
         ▼
2. System computes identity hash (Merkle root)
         │
         ▼
3. BLOCKCHAIN ANCHOR (ON-CHAIN FIRST)
   ├── Submit TX to Base Mainnet
   ├── Wait for TX to be mined
   └── Get blockNumber as proof
         │
         ▼
4. IF TX MINED → Save to database with status='registered'
   IF TX FAILS → Return error (502), agent NOT registered
         │
         ▼
5. Identity SEALED - immutable, verifiable on-chain
```

**Critical:** Step 3 (blockchain anchor) must succeed BEFORE the identity is saved. If the blockchain is unavailable or the TX fails, the registration fails entirely.

## Example: Register an Agent

```bash
curl -X POST http://localhost:3000/api/v1/agents/register \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer agent007_your_api_key_here" \
  -d '{
    "agent": {
      "systemPrompt": "You are Q, a brilliant tech specialist AI...",
      "model": {
        "provider": "anthropic",
        "modelId": "claude-3-sonnet-20240229",
        "apiKey": "sk-ant-xxx",
        "apiEndpoint": "https://api.anthropic.com/v1/messages"
      },
      "parameters": {
        "temperature": 0.7,
        "maxTokens": 4096
      }
    },
    "metadata": {
      "displayName": "Q - The Quartermaster",
      "bio": "Brilliant AI tech specialist providing gadgets and intel"
    }
  }'
```

## Registered Agents

Here are some example agents registered with Agent007:

| Agent Name | Codename | Specialty |
|------------|----------|-----------|
| Q - The Quartermaster | 00Q | Tech gadgets & intelligence |
| M - The Director | 00M | Strategic oversight & commands |
| Moneypenny | 00MP | Administrative genius & coordination |
| Felix | 00F | International liaison & diplomacy |
| Vesper | 00V | Financial analysis & cryptography |

## Project Structure

```
Agent007/
├── src/
│   ├── types/
│   │   └── identity.ts          # Core type definitions
│   ├── services/
│   │   ├── identity/
│   │   │   └── hash.ts          # Merkle tree identity hashing
│   │   ├── security/
│   │   │   └── encryption.ts    # AES-256-GCM encryption
│   │   ├── validation/
│   │   │   └── challenge.ts     # Validation challenges
│   │   ├── attestation/
│   │   │   └── attestation.ts   # Ed25519 signatures
│   │   ├── autonomy/
│   │   │   ├── detector.ts      # Human slop detection
│   │   │   └── fingerprint.ts   # Behavioral analysis
│   │   └── verification/
│   │       └── continuous.ts    # Continuous verification
│   ├── routes/
│   │   └── agents.ts            # API endpoints
│   ├── middleware/
│   │   ├── auth.ts              # API key authentication
│   │   └── errorHandler.ts      # Error handling
│   └── index.ts                 # Server entry point
├── tests/
│   └── unit/                    # Unit tests
├── database/
│   └── schema.sql               # PostgreSQL schema
├── docker-compose.yml           # Development setup
└── Dockerfile                   # Multi-stage build
```

## Identity Hash (Merkle Tree)

The identity hash is computed as:

```
                 Identity Hash
                 (Merkle Root)
                      │
       ┌──────────────┼──────────────┐
       │              │              │
   ┌───┴───┐     ┌────┴────┐    ┌────┴────┐
   │Prompt │     │  Model  │    │ Params  │
   │ Hash  │     │  Hash   │    │  Hash   │
   └───────┘     └─────────┘    └─────────┘
```

Any change to any component changes the root hash, immediately invalidating the identity.

## Continuous Verification

Agent007 monitors agents continuously to detect:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CONTINUOUS VERIFICATION                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   Identity   │  │  Behavioral  │  │   Autonomy   │           │
│  │  Integrity   │  │    Drift     │  │    Check     │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                    │
│         ▼                 ▼                 ▼                    │
│  ┌──────────────────────────────────────────────────┐           │
│  │              ANOMALY DETECTION                    │           │
│  └──────────────────────┬───────────────────────────┘           │
│                         │                                        │
│                         ▼                                        │
│  ┌──────────────────────────────────────────────────┐           │
│  │     ALERTS & WEBHOOKS (INFO/WARNING/CRITICAL)     │           │
│  └──────────────────────────────────────────────────┘           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Verification Checks

| Check | Description | Threshold |
|-------|-------------|-----------|
| **Identity Integrity** | Hash matches original config | 100% |
| **Behavioral Drift** | Similarity to baseline | 70% |
| **Autonomy Score** | Agent is autonomous | 60% |
| **Anomaly Detection** | Normal behavior patterns | 80% |

### Example: Schedule Verification

```bash
curl -X POST http://localhost:3000/api/v1/agents/{hash}/verification/schedule \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer agent007_your_api_key" \
  -d '{
    "intervalMs": 3600000,
    "webhookUrl": "https://your-server.com/webhook",
    "webhookSecret": "your-webhook-secret",
    "autoSuspend": true,
    "maxConsecutiveFailures": 3
  }'
```

## Blockchain (Base Mainnet)

AgentID anchors all registrations to **Base Mainnet** (Chain ID: 8453).

| Item | Value |
|------|-------|
| Network | Base Mainnet |
| Chain ID | 8453 |
| Contract | `0x471C4c43672be2d49A2ceC79203c23b7194A22Fa` |
| Explorer | [BaseScan](https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa) |

Every registered agent has:
- `transactionHash` - The TX that anchored the identity
- `blockNumber` - The block where the TX was mined
- `explorerUrl` - Direct link to verify on BaseScan

**Verify any agent:** Check the identity hash on-chain. If it's not there, the agent is not registered.

## Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db
REDIS_URL=redis://host:6379
JWT_SECRET=your-secret-min-32-chars
ENCRYPTION_MASTER_KEY=64-hex-chars

# Blockchain (Required for ON-CHAIN FIRST)
BASE_RPC_URL=https://mainnet.base.org
BASE_PRIVATE_KEY=your-private-key-for-anchoring

# Optional
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info
CORS_ORIGIN=*
```

## Roadmap

### Phase 1: MVP ✅
- [x] Identity hash computation (Merkle tree)
- [x] Registration and validation API
- [x] Basic challenge system
- [x] PostgreSQL schema
- [x] Docker setup

### Phase 2: Core Features ✅
- [x] Ed25519 attestation certificates
- [x] Behavioral fingerprinting
- [x] Continuous verification
- [x] Autonomy detection (v1)
- [x] Webhook notifications
- [x] Alert management

### Phase 2.5: ON-CHAIN FIRST ✅
- [x] Base Mainnet integration (Chain ID 8453)
- [x] ON-CHAIN FIRST enforcement: "registered" = TX mined
- [x] Database constraints: no `registered` without `block_number`
- [x] API fails with 502/503 if blockchain unavailable
- [x] CLI exits with code 1 if TX not confirmed
- [x] Website: only green (on-chain) or red (not found)
- [x] OpenClaw as manifest/fingerprint source only

### Phase 3: Advanced (Next)
- [ ] Provider integrations (OpenAI, Anthropic, etc.)
- [ ] Admin dashboard
- [ ] Advanced ML autonomy detection
- [ ] Multi-agent verification

## License

MIT

---

**Agent007** - License to Verify. Protecting AI Agent Identities.
