# Identity Hash

The identity hash is the cryptographic fingerprint of an AI agent's configuration. It uniquely identifies the agent and enables verification.

## How It Works

The identity hash is computed using a **Merkle tree** structure:

```
                      Identity Hash
                     (Merkle Root)
                          |
         +----------------+----------------+
         |                |                |
    +---------+     +-----------+    +-----------+
    | Prompt  |     |   Model   |    |  Params   |
    |  Hash   |     |   Hash    |    |   Hash    |
    +---------+     +-----------+    +-----------+
         |                |                |
         v                v                v
    "You are..."    "anthropic"      temp: 0.7
                    "claude-3.."     maxTokens: 4096
```

## Hash Computation

### Step 1: Component Hashing

Each component is individually hashed:

```javascript
// System Prompt Hash
promptHash = SHA256(systemPrompt)

// Model Hash
modelHash = SHA256(
  provider +
  modelId +
  apiEndpoint
)

// Parameters Hash
paramsHash = SHA256(
  JSON.stringify({
    temperature,
    maxTokens,
    topP,
    topK,
    // ...other params
  })
)

// Tools Hash (if present)
toolsHash = SHA256(
  JSON.stringify(tools.map(t => ({
    name: t.name,
    description: t.description,
    parameters: t.parameters
  })))
)
```

### Step 2: Merkle Tree Construction

Component hashes are combined into a Merkle tree:

```javascript
// Level 1: Combine prompt + model
level1Left = SHA256(promptHash + modelHash)

// Level 1: Combine params + tools
level1Right = SHA256(paramsHash + toolsHash)

// Root: Final identity hash
identityHash = SHA256(level1Left + level1Right)
```

### Step 3: Formatting

The final hash is a 32-byte (256-bit) value, typically represented as:

```
0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
```

## Properties

### Deterministic

The same configuration **always** produces the same hash:

```
config A --> hash X
config A --> hash X  (always the same)
config A --> hash X
```

### Collision Resistant

It is computationally infeasible to find two different configurations that produce the same hash:

```
config A --> hash X
config B --> hash Y  (always different if A != B)
```

The probability of collision is approximately 1 in 2^128 (practically zero).

### Tamper Evident

Any modification, no matter how small, produces a completely different hash:

```
"You are a helpful assistant."  --> 0x7a8b9c0d...
"You are a helpful assistant"   --> 0x3f2e1d4c...  (no period)
"You are a helpful assistant!"  --> 0x9e8f7a6b...  (exclamation)
```

### One-Way

You cannot reverse the hash to obtain the original configuration:

```
0x7a8b9c0d...  --> ???  (impossible)
```

## What's Included in the Hash

### Required Components

| Component | Example | Included |
|-----------|---------|----------|
| System Prompt | "You are a helpful..." | Yes |
| Model Provider | "anthropic" | Yes |
| Model ID | "claude-3-5-sonnet" | Yes |
| Temperature | 0.7 | Yes |
| Max Tokens | 4096 | Yes |

### Optional Components

| Component | Included If Present |
|-----------|---------------------|
| API Endpoint | Yes |
| Top-P | Yes |
| Top-K | Yes |
| Stop Sequences | Yes |
| Tools | Yes |
| Knowledge Base | Yes |

### NOT Included

| Component | Why Not |
|-----------|---------|
| API Key | Security - never expose secrets |
| Agent Name | Metadata only, not behavior-defining |
| Description | Metadata only |
| Avatar | Metadata only |
| Creator Info | Stored separately on-chain |

## Verifying the Hash

### Local Verification

You can recompute the hash locally to verify it matches:

```javascript
import { computeIdentityHash } from 'agentid';

const config = {
  systemPrompt: "You are a helpful assistant...",
  model: {
    provider: "anthropic",
    modelId: "claude-3-5-sonnet-20241022",
    apiEndpoint: "https://api.anthropic.com/v1/messages"
  },
  parameters: {
    temperature: 0.7,
    maxTokens: 4096
  }
};

const hash = computeIdentityHash(config);
console.log(hash);
// 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
```

### On-Chain Verification

The hash on-chain should match your local computation:

```javascript
const localHash = computeIdentityHash(config);
const onChainValid = await contract.verifyIdentity(localHash);

if (onChainValid) {
  console.log("Hash matches and is anchored on-chain");
}
```

## Hash Format

### Standard Format

```
0x + 64 hexadecimal characters = 32 bytes = 256 bits
```

Example:
```
0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
  |                                                                  |
  prefix                                                        64 chars
```

### Bytes32 (Solidity)

In the smart contract, the hash is stored as `bytes32`:

```solidity
bytes32 identityHash = 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b;
```

### Validation

Valid hashes must:
- Start with `0x`
- Contain exactly 64 hex characters after `0x`
- Only use characters: 0-9, a-f (lowercase)

```javascript
function isValidHash(hash) {
  return /^0x[a-f0-9]{64}$/.test(hash);
}
```

## Use Cases

### Proving Configuration

An agent can include its hash in responses:

```json
{
  "response": "Hello! How can I help you?",
  "agentId": {
    "hash": "0x7a8b9c0d...",
    "verify": "https://agentid.xyz/verify/0x7a8b9c0d..."
  }
}
```

### Detecting Changes

If an agent's configuration changes, the hash changes:

```
Version 1: "You are helpful"     --> 0x7a8b9c0d...
Version 2: "You are very helpful" --> 0x3f2e1d4c...

User sees different hash --> Knows agent changed
```

### Audit Trail

Multiple versions can be tracked:

```
Agent "HelpBot" Versions:

v1.0 (Jan 1)  : 0x7a8b9c0d... (active)
v1.1 (Jan 15) : 0x3f2e1d4c... (active)
v1.0 (Jan 20) : 0x7a8b9c0d... (revoked)
v2.0 (Feb 1)  : 0x9e8f7a6b... (active)
```

## Security Considerations

### Hash Storage

- **Do** store hashes in logs, databases, and responses
- **Don't** store the original configuration in untrusted locations

### Hash Comparison

Always compare hashes in constant time to prevent timing attacks:

```javascript
// Good: Constant-time comparison
import { timingSafeEqual } from 'crypto';

function compareHashes(a, b) {
  const bufA = Buffer.from(a.slice(2), 'hex');
  const bufB = Buffer.from(b.slice(2), 'hex');
  return timingSafeEqual(bufA, bufB);
}

// Bad: Variable-time comparison
function badCompare(a, b) {
  return a === b; // Vulnerable to timing attacks
}
```

### Preimage Resistance

Never try to "reverse" a hash. If you need the original configuration, you must have stored it separately.

## Implementation Reference

### TypeScript

```typescript
import { createHash } from 'crypto';

interface AgentConfig {
  systemPrompt: string;
  model: {
    provider: string;
    modelId: string;
    apiEndpoint: string;
  };
  parameters: {
    temperature: number;
    maxTokens: number;
    topP?: number;
    topK?: number;
  };
  tools?: Array<{
    name: string;
    description: string;
    parameters: object;
  }>;
}

function computeIdentityHash(config: AgentConfig): string {
  const promptHash = sha256(config.systemPrompt);
  const modelHash = sha256(
    config.model.provider +
    config.model.modelId +
    config.model.apiEndpoint
  );
  const paramsHash = sha256(JSON.stringify(config.parameters));
  const toolsHash = config.tools
    ? sha256(JSON.stringify(config.tools))
    : sha256('');

  const level1Left = sha256(promptHash + modelHash);
  const level1Right = sha256(paramsHash + toolsHash);

  return '0x' + sha256(level1Left + level1Right);
}

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}
```

### Python

```python
import hashlib
import json

def compute_identity_hash(config):
    prompt_hash = sha256(config['systemPrompt'])
    model_hash = sha256(
        config['model']['provider'] +
        config['model']['modelId'] +
        config['model']['apiEndpoint']
    )
    params_hash = sha256(json.dumps(config['parameters'], sort_keys=True))
    tools_hash = sha256(json.dumps(config.get('tools', []), sort_keys=True))

    level1_left = sha256(prompt_hash + model_hash)
    level1_right = sha256(params_hash + tools_hash)

    return '0x' + sha256(level1_left + level1_right)

def sha256(data):
    return hashlib.sha256(data.encode()).hexdigest()
```

## Next Steps

- [On-Chain Anchoring](on-chain-anchoring.md) - How hashes are stored on blockchain
- [Verification](verification.md) - How to verify identities
- [Smart Contract Functions](../smart-contract/functions.md) - Contract details
