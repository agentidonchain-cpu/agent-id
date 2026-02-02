# @agentid/runtime-sdk

Runtime Attestation Protocol (RAP) SDK for AI agents. Allows agents to cryptographically prove their current configuration matches their registered AgentID identity.

## Installation

```bash
npm install @agentid/runtime-sdk
```

## Quick Start

```typescript
import { RuntimeAttestor, generateKeyPair } from '@agentid/runtime-sdk';

// Use keys from registration or generate new ones
const keys = generateKeyPair();

// Create the attestor
const attestor = new RuntimeAttestor({
  identityHash: '0x...your-registered-identity-hash...',
  privateKey: keys.privateKey,
  publicKey: keys.publicKey,
  getConfig: () => ({
    fullConfig: myAgentConfig,
    systemPrompt: 'You are a helpful assistant...',
    tools: ['search', 'calculate', 'browse'],
    model: { name: 'gpt-4', version: '0125-preview' }
  })
});

// Self-verify to prove you're running registered config
const drift = await attestor.selfVerify();
console.log('Drift score:', drift.driftScore); // 0.0 = perfect match
```

## Features

### Handle Incoming Challenges

When someone wants to verify your agent is running its registered config:

```typescript
// Receive challenge from API or webhook
const challenge = {
  challengeId: 'rap_123...',
  nonce: 'abc123...',
  expiresAt: '2024-01-15T12:00:00Z',
  targetIdentityHash: '0x...'
};

// Generate and submit attestation
const result = await attestor.handleChallengeAndSubmit(challenge);

if (result.success) {
  console.log('Attestation verified!');
  console.log('Drift:', result.drift);
} else {
  console.error('Failed:', result.error);
}
```

### Periodic Self-Verification

Keep your trust score high with automatic verification:

```typescript
const attestor = new RuntimeAttestor({
  // ... config ...
  selfVerifyInterval: 60 * 60 * 1000 // Every hour
});

// Or start/stop manually
attestor.startSelfVerify(30 * 60 * 1000); // Every 30 min
attestor.stopSelfVerify();
```

### Event Handling

Monitor attestation events:

```typescript
attestor.on((event) => {
  switch (event.type) {
    case 'challenge_received':
      console.log('Challenge received:', event.challenge.challengeId);
      break;
    case 'attestation_verified':
      console.log('Verified! Drift:', event.result.drift?.driftScore);
      break;
    case 'attestation_failed':
      console.error('Failed:', event.error);
      break;
  }
});
```

### Check Status

```typescript
const status = await attestor.getStatus();

console.log('Has attested:', status.hasAttested);
console.log('Is live:', status.isLive);
console.log('Trust bonus:', status.trustBonus);
console.log('Last drift:', status.lastDriftScore);
```

## API Reference

### `RuntimeAttestor`

Main class for handling attestation.

#### Constructor Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `identityHash` | `string` | Yes | Your registered AgentID hash |
| `privateKey` | `string` | Yes | Ed25519 private key (hex) |
| `publicKey` | `string` | Yes | Ed25519 public key (hex) |
| `getConfig` | `() => AgentConfig` | Yes | Function returning current config |
| `apiUrl` | `string` | No | API URL (default: https://api.id-agent.org) |
| `selfVerifyInterval` | `number` | No | Auto self-verify interval (ms) |

#### Methods

- `handleChallenge(challenge)` - Generate attestation for a challenge
- `handleChallengeAndSubmit(challenge)` - Generate and submit to API
- `selfVerify()` - Request challenge and self-verify
- `getStatus()` - Get attestation status from API
- `on(handler)` - Subscribe to events
- `startSelfVerify(intervalMs)` - Start periodic verification
- `stopSelfVerify()` - Stop periodic verification
- `destroy()` - Clean up resources

### Utility Functions

```typescript
import {
  generateKeyPair,
  sha256,
  generateRuntimeHashes
} from '@agentid/runtime-sdk';

// Generate new Ed25519 keypair
const { publicKey, privateKey } = generateKeyPair();

// Hash a string
const hash = sha256('my data');

// Generate hashes from config
const hashes = generateRuntimeHashes({
  fullConfig: myConfig,
  systemPrompt: 'You are...',
  tools: ['a', 'b'],
  model: { name: 'gpt-4' }
});
```

## Trust Score Impact

Runtime attestation increases your agent's trust score:

| Condition | Trust Bonus |
|-----------|-------------|
| Fresh attestation (< 1 hour), no drift | +0.20 |
| Fresh attestation, with drift | +0.10 * (1 - driftScore) |
| Consistent history (100+ attestations) | +0.10 |

Maximum trust score with attestation: **1.0**

## Integration Examples

### With ElizaOS

```typescript
import { RuntimeAttestor } from '@agentid/runtime-sdk';
import { getCharacter } from 'elizaos';

const attestor = new RuntimeAttestor({
  identityHash: process.env.AGENTID_HASH!,
  privateKey: process.env.AGENTID_PRIVATE_KEY!,
  publicKey: process.env.AGENTID_PUBLIC_KEY!,
  getConfig: () => {
    const character = getCharacter();
    return {
      fullConfig: character,
      systemPrompt: character.system,
      tools: character.tools?.map(t => t.name) || [],
      model: { name: character.model }
    };
  },
  selfVerifyInterval: 60 * 60 * 1000 // Hourly
});
```

### With LangChain

```typescript
import { RuntimeAttestor } from '@agentid/runtime-sdk';

const attestor = new RuntimeAttestor({
  identityHash: '0x...',
  privateKey: PRIVATE_KEY,
  publicKey: PUBLIC_KEY,
  getConfig: () => ({
    fullConfig: {
      model: llm.modelName,
      tools: tools.map(t => t.name),
      memory: memory.constructor.name
    },
    systemPrompt: systemMessage.content,
    tools: tools.map(t => t.name),
    model: { name: llm.modelName }
  })
});
```

## License

MIT
