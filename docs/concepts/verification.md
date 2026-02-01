# Verification

Verification is the process of confirming that an agent's identity hash exists on-chain and is valid. This can be done by anyone, without permission or API keys.

## The Verification Process

```
+------------------+     +------------------+     +------------------+
| 1. Get Hash      | --> | 2. Query Chain   | --> | 3. Interpret     |
|    from Agent    |     |    Directly      |     |    Results       |
+------------------+     +------------------+     +------------------+
        |                        |                        |
        v                        v                        v
  Agent provides          Call verifyIdentity()    Hash exists?
  its identity hash       on Base Mainnet          Not revoked?
```

## Why Independent Verification Matters

AgentID is designed so you **don't need to trust us** to verify an agent:

```
              Traditional                    AgentID
              Verification                   Verification

User --> Trust Provider --> Result      User --> Blockchain --> Result
              |                                    |
              v                                    v
         Centralized                         Decentralized
         Can be compromised                  Trustless
         Can be censored                     Immutable
         Requires API access                 Public access
```

## Verification Methods

### Method 1: AgentID CLI

The simplest way to verify:

```bash
npx agentidbase verify 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
```

Output:
```
AgentID - Verify Identity

Identity Hash: 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b

On-Chain Status:
  Anchored: Yes
  Creator: 0xAcmeCorp1234567890abcdef1234567890abcdef
  Anchored At: 2024-01-15 10:30:00 UTC (Block #12345678)
  Revoked: No

Verification: VALID
```

### Method 2: Direct Contract Call

Query the blockchain directly without any intermediary:

```bash
# Using Foundry (cast)
cast call 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa \
  "verifyIdentity(bytes32)(bool)" \
  0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b \
  --rpc-url https://mainnet.base.org
```

Output: `true` or `false`

### Method 3: JSON-RPC (curl)

Raw blockchain query:

```bash
curl -X POST https://mainnet.base.org \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_call",
    "params": [{
      "to": "0x471C4c43672be2d49A2ceC79203c23b7194A22Fa",
      "data": "0x2a8e0d287a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b"
    }, "latest"]
  }'
```

Response:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": "0x0000000000000000000000000000000000000000000000000000000000000001"
}
```

(`0x...001` = true, `0x...000` = false)

### Method 4: ethers.js

```javascript
import { ethers } from 'ethers';

const CONTRACT = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';
const ABI = ['function verifyIdentity(bytes32) view returns (bool)'];

async function verify(identityHash) {
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const contract = new ethers.Contract(CONTRACT, ABI, provider);

  const isValid = await contract.verifyIdentity(identityHash);
  return isValid;
}

// Usage
const valid = await verify('0x7a8b9c0d...');
console.log('Valid:', valid);
```

### Method 5: viem

```typescript
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

async function verify(identityHash: `0x${string}`) {
  const isValid = await client.readContract({
    address: '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa',
    abi: [{
      name: 'verifyIdentity',
      type: 'function',
      inputs: [{ name: 'identityHash', type: 'bytes32' }],
      outputs: [{ type: 'bool' }],
      stateMutability: 'view',
    }],
    functionName: 'verifyIdentity',
    args: [identityHash],
  });

  return isValid;
}
```

### Method 6: Web3.js

```javascript
import Web3 from 'web3';

const web3 = new Web3('https://mainnet.base.org');

const CONTRACT = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';
const ABI = [{
  name: 'verifyIdentity',
  type: 'function',
  inputs: [{ name: 'identityHash', type: 'bytes32' }],
  outputs: [{ name: 'valid', type: 'bool' }],
  stateMutability: 'view',
}];

const contract = new web3.eth.Contract(ABI, CONTRACT);

async function verify(identityHash) {
  return await contract.methods.verifyIdentity(identityHash).call();
}
```

## Getting Full Identity Details

For more information than just valid/invalid:

```bash
cast call 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa \
  "getIdentity(bytes32)(bool,address,uint256,uint256,bool)" \
  0x7a8b9c0d... \
  --rpc-url https://mainnet.base.org
```

Returns:
- `exists`: Whether the identity is anchored
- `creator`: Address that anchored it
- `anchoredAt`: Unix timestamp
- `revokedAt`: Unix timestamp (0 if not revoked)
- `isValid`: exists AND not revoked

### JavaScript Example

```javascript
const ABI = [
  'function getIdentity(bytes32) view returns (bool exists, address creator, uint256 anchoredAt, uint256 revokedAt, bool isValid)'
];

const contract = new ethers.Contract(CONTRACT, ABI, provider);
const [exists, creator, anchoredAt, revokedAt, isValid] = await contract.getIdentity(hash);

console.log({
  exists,
  creator,
  anchoredAt: new Date(Number(anchoredAt) * 1000),
  revoked: revokedAt > 0,
  isValid
});
```

## Verification States

| State | `verifyIdentity()` | Meaning |
|-------|-------------------|---------|
| **Valid** | `true` | Exists and not revoked |
| **Not Found** | `false` | Never anchored |
| **Revoked** | `false` | Was anchored, now revoked |

### Distinguishing States

```javascript
async function getVerificationState(hash) {
  const [exists, creator, anchoredAt, revokedAt, isValid] =
    await contract.getIdentity(hash);

  if (!exists) {
    return { state: 'NOT_FOUND', message: 'Identity not anchored' };
  }

  if (revokedAt > 0) {
    return {
      state: 'REVOKED',
      message: 'Identity was revoked',
      revokedAt: new Date(Number(revokedAt) * 1000)
    };
  }

  return {
    state: 'VALID',
    message: 'Identity is valid',
    creator,
    anchoredAt: new Date(Number(anchoredAt) * 1000)
  };
}
```

## Verification Proof

Generate a proof that can be shared:

```bash
npx agentidbase proof 0x7a8b9c0d...
```

Output:
```
AgentID - Verification Proof

Identity Hash: 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b

Verify independently using any of these methods:

1. Foundry (cast):
   cast call 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa \
     "verifyIdentity(bytes32)" \
     0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b \
     --rpc-url https://mainnet.base.org

2. curl (JSON-RPC):
   curl -X POST https://mainnet.base.org \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0x471C4c43672be2d49A2ceC79203c23b7194A22Fa","data":"0x2a8e0d287a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b"},"latest"]}'

3. BaseScan:
   https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa#readContract

Contract: 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa
Network: Base Mainnet (Chain ID: 8453)
```

## Integrating Verification

### In Your Application

```javascript
// Middleware to verify agent identity
async function verifyAgentMiddleware(req, res, next) {
  const agentHash = req.headers['x-agent-id'];

  if (!agentHash) {
    return res.status(401).json({ error: 'Missing agent identity' });
  }

  const isValid = await verifyIdentity(agentHash);

  if (!isValid) {
    return res.status(403).json({ error: 'Invalid or revoked agent identity' });
  }

  req.agentIdentity = agentHash;
  next();
}
```

### In Agent Responses

```javascript
// Include verification info in responses
function buildResponse(content) {
  return {
    content,
    identity: {
      hash: AGENT_IDENTITY_HASH,
      contract: '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa',
      network: 'base',
      verify: `https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa#readContract`
    }
  };
}
```

### Caching Verification

For performance, cache verification results:

```javascript
const verificationCache = new Map();
const CACHE_TTL = 60 * 1000; // 1 minute

async function verifyWithCache(hash) {
  const cached = verificationCache.get(hash);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  const result = await verifyIdentity(hash);
  verificationCache.set(hash, { result, timestamp: Date.now() });
  return result;
}
```

## Alternative RPC Endpoints

If one RPC is unavailable, use alternatives:

| Provider | URL |
|----------|-----|
| Base (Official) | `https://mainnet.base.org` |
| Alchemy | `https://base-mainnet.g.alchemy.com/v2/YOUR_KEY` |
| Infura | `https://base-mainnet.infura.io/v3/YOUR_KEY` |
| QuickNode | `https://YOUR_ENDPOINT.base-mainnet.quiknode.pro` |
| Ankr | `https://rpc.ankr.com/base` |

### Fallback Pattern

```javascript
const RPC_ENDPOINTS = [
  'https://mainnet.base.org',
  'https://rpc.ankr.com/base',
  'https://base.publicnode.com'
];

async function verifyWithFallback(hash) {
  for (const rpc of RPC_ENDPOINTS) {
    try {
      const provider = new ethers.JsonRpcProvider(rpc);
      const contract = new ethers.Contract(CONTRACT, ABI, provider);
      return await contract.verifyIdentity(hash);
    } catch (error) {
      console.warn(`RPC ${rpc} failed, trying next...`);
    }
  }
  throw new Error('All RPC endpoints failed');
}
```

## Security Best Practices

### Verify Locally

Always compute and verify hashes locally when possible:

```javascript
// Verify the hash matches the claimed configuration
const computedHash = computeIdentityHash(agentConfig);
const claimedHash = agent.identityHash;

if (computedHash !== claimedHash) {
  throw new Error('Hash mismatch - config does not match claimed identity');
}

// Then verify on-chain
const onChainValid = await verifyIdentity(claimedHash);
```

### Don't Trust Headers Alone

```javascript
// BAD: Trust header without verification
const agentHash = req.headers['x-agent-id'];
// proceed without verification...

// GOOD: Always verify
const agentHash = req.headers['x-agent-id'];
const isValid = await verifyIdentity(agentHash);
if (!isValid) throw new Error('Invalid identity');
```

### Handle Network Errors

```javascript
async function safeVerify(hash) {
  try {
    return await verifyIdentity(hash);
  } catch (error) {
    // Log error but don't expose details
    console.error('Verification failed:', error.message);

    // Fail closed - treat network errors as invalid
    return false;
  }
}
```

## Troubleshooting

### "RPC connection failed"

Try a different RPC endpoint or check your internet connection.

### "Invalid hash format"

Ensure the hash is:
- Prefixed with `0x`
- Exactly 64 hex characters
- Lowercase

```javascript
function normalizeHash(hash) {
  if (!hash.startsWith('0x')) hash = '0x' + hash;
  return hash.toLowerCase();
}
```

### "Returns false but should be valid"

Check:
1. Hash is correctly formatted
2. Identity was actually anchored (not just registered)
3. Identity wasn't revoked

## Next Steps

- [CLI Commands](../cli/commands.md) - Full CLI reference
- [Smart Contract Functions](../smart-contract/functions.md) - Contract details
- [API Endpoints](../api/endpoints.md) - REST API
