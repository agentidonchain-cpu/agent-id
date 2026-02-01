# Agent007 - Implementation Documentation

## Overview

Agent007 is a system designed to ensure **immutable agent identities** for AI agent networks. It solves two critical problems:

1. **Identity Mutation**: After validation, creators could modify agents (changing prompts, configurations), breaking the agent's identity
2. **Human Slop Detection**: Many agents are puppeteered by humans rather than being truly autonomous

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                           Agent007                               │
├─────────────────────────────────────────────────────────────────┤
│  API Layer (Express.js)                                          │
│  ├── /agents/register     - Register new agent                  │
│  ├── /agents/validate     - Validate with challenge-response    │
│  ├── /agents/:hash/verify - Verify identity unchanged           │
│  ├── /agents/:hash/samples - Submit behavioral samples          │
│  ├── /agents/:hash/autonomy - Get autonomy analysis             │
│  ├── /agents/:hash/fingerprint - Get behavioral fingerprint     │
│  ├── /agents/:hash/attestations - Create attestation            │
│  └── /agents/:hash/certificate - Get/verify certificate         │
├─────────────────────────────────────────────────────────────────┤
│  Services Layer                                                  │
│  ├── Identity Hash (Merkle Tree)                                │
│  ├── Encryption (AES-256-GCM + Scrypt)                          │
│  ├── Challenge Validation                                        │
│  ├── Attestation (Ed25519 signatures)                           │
│  ├── Behavioral Fingerprinting                                   │
│  └── Autonomy Detection                                          │
├─────────────────────────────────────────────────────────────────┤
│  Storage Layer                                                   │
│  ├── PostgreSQL (identities, attestations, audit logs)          │
│  └── Redis (sessions, rate limiting)                            │
└─────────────────────────────────────────────────────────────────┘
```

## Phase 1: MVP - Identity Verification

### Identity Hash Service (`src/services/identity/hash.ts`)

Uses Merkle Tree hashing to create a unique, tamper-evident fingerprint of an agent's configuration:

- **Components hashed**: System prompt, model config, generation parameters, tools, knowledge base
- **Algorithm**: SHA-256
- **Output**: 64-character hex hash

```typescript
const hashResult = identityHashService.computeIdentityHash(agentCore);
// Returns: { identityHash: "7e486dc4...", componentHashes: {...}, merkleRoot: "..." }
```

### Encryption Service (`src/services/security/encryption.ts`)

Protects sensitive data (system prompts, API keys):

- **Algorithm**: AES-256-GCM
- **Key Derivation**: Scrypt (from master key + random salt)
- **Features**: Authenticated encryption, replay protection

### Challenge Validation (`src/services/validation/challenge.ts`)

Validates that an agent is configured exactly as declared:

1. Generates 5 challenge prompts (identity, capability, behavioral)
2. Agent responds to challenges
3. Responses analyzed for AI-likeness and consistency
4. Minimum score: 0.7 to pass

## Phase 2: Behavioral Analysis & Attestation

### Attestation Service (`src/services/attestation/attestation.ts`)

Creates cryptographically signed attestations using Ed25519:

```typescript
const attestation = await attestationService.createAttestation({
  identityHash: "7e486dc4...",
  type: AttestationType.IDENTITY_VALIDATION,
  trustLevel: TrustLevel.HIGH,
  claim: "Agent identity verified"
});
```

**Certificate Structure**:
```json
{
  "version": "1.0",
  "type": "agent_identity",
  "subject": { "identityHash": "...", "displayName": "..." },
  "issuer": { "name": "agent007", "publicKey": "..." },
  "validity": { "notBefore": "...", "notAfter": "..." },
  "claims": {
    "configurationVerified": true,
    "behavioralBaselineEstablished": true,
    "autonomyScore": 0.85,
    "trustLevel": "high"
  },
  "signature": "..."
}
```

### Behavioral Fingerprint (`src/services/autonomy/fingerprint.ts`)

Creates a behavioral baseline from response samples:

- **Latency Statistics**: mean, stdDev, percentiles (p50, p95, p99)
- **Vocabulary Metrics**: unique words, sentence length, readability score, type-token ratio
- **Style Markers**: punctuation patterns, capitalization, response structure
- **Consistency Score**: How stable is the agent's behavior over time

### Autonomy Detector (`src/services/autonomy/detector.ts`)

Detects "human slop" - agents controlled by humans:

**Timing Features**:
- API-range latency ratio (500ms-5000ms typical for LLMs)
- Human timing detection (<200ms copy-paste or >10s typing)
- Time-of-day entropy (humans follow schedules)
- Burst patterns (humans work in spurts)

**Language Features**:
- Typo detection (common misspellings)
- Filler words ("um", "like", "you know", "basically")
- Hedging phrases ("I think", "maybe", "probably")
- Emotional variance

**Classification**:
| Score | Classification |
|-------|----------------|
| ≥0.85 | `fully_autonomous` |
| ≥0.60 | `supervised` |
| ≥0.40 | `hybrid_suspicious` |
| <0.40 | `human_controlled` |

## API Endpoints

### Phase 1 Endpoints

```
POST /api/v1/agents/register
  - Register a new agent identity
  - Returns: registrationId, challenge prompts

POST /api/v1/agents/validate
  - Submit challenge responses
  - Returns: identityHash, validation score

GET /api/v1/agents/:hash
  - Get agent details

GET /api/v1/agents/:hash/verify
  - Verify identity is unchanged
```

### Phase 2 Endpoints

```
POST /api/v1/agents/:hash/samples
  - Submit response samples for behavioral analysis
  - Body: { samples: [{ content, latencyMs, timestamp, prompt? }] }

GET /api/v1/agents/:hash/autonomy
  - Get autonomy analysis
  - Returns: autonomyScore, classification, patterns, alerts

GET /api/v1/agents/:hash/fingerprint
  - Get behavioral fingerprint
  - Returns: latency stats, vocabulary metrics, style markers

POST /api/v1/agents/:hash/attestations
  - Create signed attestation
  - Body: { type, claim }
  - Returns: signed attestation with Ed25519 signature

GET /api/v1/agents/:hash/certificate
  - Get identity certificate
  - Returns: signed certificate valid for 1 year

POST /api/v1/agents/:hash/certificate/verify
  - Verify certificate signature
  - Body: { certificate }
  - Returns: { valid: boolean, error?: string }
```

## Database Schema

Located in `database/schema.sql`:

### Core Tables
- `creators` - Agent creators/owners
- `agent_identities` - Validated agent identities
- `agent_core_configs` - Immutable agent configurations (with trigger protection)
- `agent_tools` - Tool definitions
- `agent_knowledge_documents` - Knowledge base documents
- `agent_metadata` - Display metadata

### Verification Tables
- `validation_challenges` - Challenge-response records
- `attestations` - Signed attestations
- `behavioral_fingerprints` - Behavioral baselines
- `autonomy_analyses` - Autonomy detection results
- `identity_violations` - Detected tampering

### Audit Tables
- `audit_log` - All state changes
- `proxy_logs` - API request logging

## Type Definitions

Located in `src/types/identity.ts`:

```typescript
enum ModelProvider { OPENAI, ANTHROPIC, GOOGLE, MISTRAL, ... }
enum IdentityStatus { PENDING, VALIDATED, SUSPENDED, REVOKED }
enum AttestationType { IDENTITY_VALIDATION, BEHAVIORAL, CONFIGURATION, ... }
enum TrustLevel { LOW, MEDIUM, HIGH, CRITICAL }
enum AutonomyClassification { FULLY_AUTONOMOUS, SUPERVISED, HYBRID_SUSPICIOUS, HUMAN_CONTROLLED }

interface AgentCoreIdentity {
  version: string;
  systemPrompt: SystemPrompt;
  model: ModelConfig;
  parameters: GenerationParameters;
  tools: ToolDefinition[];
  knowledgeBase: KnowledgeDocument[];
}
```

## Testing

48 unit tests covering all Phase 2 services:

```bash
npm test
```

### Test Files
- `tests/unit/attestation.test.ts` - 17 tests (signatures, certificates, verification)
- `tests/unit/autonomy.test.ts` - 18 tests (timing, language, classification)
- `tests/unit/fingerprint.test.ts` - 13 tests (latency, vocabulary, style)

## Running the Server

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

### Environment Variables

```env
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/agent007_db
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-jwt-secret-min-32-chars
ENCRYPTION_MASTER_KEY=64-hex-chars-for-aes-256
API_KEY_PREFIX=agent007_
```

## Security Considerations

1. **System Prompts**: Encrypted at rest with AES-256-GCM
2. **API Keys**: Hashed with SHA-256 before storage
3. **Signatures**: Ed25519 for attestations and certificates
4. **Rate Limiting**: Configurable per-key and per-IP limits
5. **Audit Logging**: All operations logged for forensics

## Future Work (Phase 3+)

- [ ] Continuous verification (periodic identity checks)
- [ ] Multi-party attestation chains
- [ ] Provider-native attestation integration
- [ ] Behavioral drift detection over time
- [ ] Webhook notifications for violations
- [ ] Admin dashboard

## Project Structure

```
Agent007/
├── src/
│   ├── index.ts                 # Server entry point
│   ├── config/                  # Configuration
│   ├── middleware/              # Auth, error handling
│   ├── routes/
│   │   └── agents.ts            # All API endpoints
│   ├── services/
│   │   ├── identity/
│   │   │   └── hash.ts          # Merkle tree hashing
│   │   ├── security/
│   │   │   └── encryption.ts    # AES-256-GCM
│   │   ├── validation/
│   │   │   └── challenge.ts     # Challenge-response
│   │   ├── attestation/
│   │   │   └── attestation.ts   # Ed25519 signatures
│   │   └── autonomy/
│   │       ├── detector.ts      # Human slop detection
│   │       └── fingerprint.ts   # Behavioral analysis
│   ├── types/
│   │   └── identity.ts          # TypeScript types
│   └── utils/
│       └── logger.ts            # Pino logger
├── tests/
│   └── unit/
│       ├── attestation.test.ts
│       ├── autonomy.test.ts
│       └── fingerprint.test.ts
├── database/
│   └── schema.sql               # PostgreSQL schema
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── .env
```

## Dependencies

### Production
- `express` - Web framework
- `@noble/ed25519` - Ed25519 signatures
- `@noble/hashes` - SHA-512 for ed25519
- `pg` - PostgreSQL client
- `ioredis` - Redis client
- `zod` - Schema validation
- `pino` - Logging
- `helmet` - Security headers
- `bcrypt` - Password hashing
- `uuid` - UUID generation

### Development
- `vitest` - Testing framework
- `tsx` - TypeScript execution
- `typescript` - Type checking

---

*Agent007 v0.1.0 - License to Verify. Protecting AI Agent Identities.*
