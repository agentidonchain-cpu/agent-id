# On-Chain Anchoring

On-chain anchoring is the process of recording an identity hash on the blockchain, creating an immutable, timestamped proof of existence.

## Why On-Chain?

Storing identity hashes on a blockchain provides:

```
+------------------+     +------------------+     +------------------+
|   Immutability   |     |   Transparency   |     |  Decentralization|
+------------------+     +------------------+     +------------------+
| Once written,    |     | Anyone can read  |     | No single point  |
| cannot be        |     | and verify the   |     | of failure or    |
| modified or      |     | data without     |     | control          |
| deleted          |     | permission       |     |                  |
+------------------+     +------------------+     +------------------+
```

### Comparison

| Storage | Immutable | Transparent | Decentralized | Timestamped |
|---------|-----------|-------------|---------------|-------------|
| Blockchain | Yes | Yes | Yes | Yes |
| Database | No | No | No | Maybe |
| File System | No | No | No | Maybe |
| IPFS | Yes | Yes | Yes | No |

## Base Mainnet

AgentID uses **Base Mainnet** for anchoring:

| Property | Value |
|----------|-------|
| **Network** | Base Mainnet |
| **Chain ID** | 8453 |
| **Contract** | `0x471C4c43672be2d49A2ceC79203c23b7194A22Fa` |
| **Block Time** | ~2 seconds |
| **Gas Token** | ETH |

### Why Base?

- **Low Fees**: Typically < $0.01 per transaction
- **Fast Finality**: Transactions confirm in seconds
- **Ethereum Security**: Inherits Ethereum's security via L2
- **Wide Support**: Compatible with all Ethereum tools

## The Anchoring Process

```
+-------------+     +-------------+     +-------------+     +-------------+
| 1. Compute  | --> | 2. Sign     | --> | 3. Submit   | --> | 4. Confirm  |
|    Hash     |     |    Txn      |     |    to Chain |     |    Block    |
+-------------+     +-------------+     +-------------+     +-------------+
      |                   |                   |                   |
      v                   v                   v                   v
  SHA-256 of         Private key         Broadcast to       Included in
  agent config       signs the txn       Base network       a block
```

### Step 1: Compute Hash

The identity hash is computed locally from the agent configuration.

### Step 2: Sign Transaction

A wallet signs a transaction calling `anchorIdentity(bytes32)`:

```solidity
function anchorIdentity(bytes32 identityHash) external {
    // Stores hash with creator address and timestamp
}
```

### Step 3: Submit to Chain

The signed transaction is broadcast to the Base network.

### Step 4: Block Confirmation

Once included in a block, the anchor is permanent:

```
Block #12345678
├── Transaction 0x1234...
│   └── anchorIdentity(0x7a8b9c0d...)
│       ├── identityHash: 0x7a8b9c0d...
│       ├── creator: 0xYourWallet...
│       └── timestamp: 1705312200
```

## What Gets Stored

The smart contract stores:

```solidity
struct Identity {
    bytes32 identityHash;   // The hash itself
    address creator;        // Who anchored it
    uint256 anchoredAt;     // Block timestamp
    uint256 revokedAt;      // 0 if not revoked
    bool exists;            // True if anchored
}
```

### On-Chain Data

| Field | Description | Example |
|-------|-------------|---------|
| `identityHash` | The agent's hash | `0x7a8b9c0d...` |
| `creator` | Wallet that anchored | `0xAcme1234...` |
| `anchoredAt` | Unix timestamp | `1705312200` |
| `revokedAt` | Unix timestamp or 0 | `0` |
| `exists` | Boolean flag | `true` |

### NOT Stored On-Chain

| Data | Where It's Stored |
|------|-------------------|
| Agent configuration | Off-chain (your system) |
| System prompt | Off-chain |
| API keys | Never stored anywhere public |
| Agent metadata | AgentID API (optional) |

## Anchoring with CLI

### Basic Anchoring

```bash
npx agentidbase anchor 0x7a8b9c0d... --private-key <your-key>
```

### Using Environment Variable

```bash
export PRIVATE_KEY=0x1234...
npx agentidbase anchor 0x7a8b9c0d...
```

### Combined Register + Anchor

```bash
# Registers via API and anchors on-chain
npx agentidbase register --config agent.json
```

### Anchor Only (Skip API)

```bash
# Direct on-chain anchoring
npx agentidbase anchor 0x7a8b9c0d... --private-key <key>
```

## Anchoring Programmatically

### Using ethers.js

```javascript
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';
const ABI = [
  'function anchorIdentity(bytes32 identityHash) external',
  'event IdentityAnchored(bytes32 indexed identityHash, address indexed creator, uint256 timestamp)'
];

async function anchorIdentity(identityHash, privateKey) {
  const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

  const tx = await contract.anchorIdentity(identityHash);
  const receipt = await tx.wait();

  console.log('Anchored in block:', receipt.blockNumber);
  console.log('Transaction:', receipt.hash);

  return receipt;
}
```

### Using viem

```typescript
import { createWalletClient, createPublicClient, http } from 'viem';
import { base } from 'viem/chains';
import { privateKeyToAccount } from 'viem/accounts';

const CONTRACT_ADDRESS = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';
const ABI = [{
  name: 'anchorIdentity',
  type: 'function',
  inputs: [{ name: 'identityHash', type: 'bytes32' }],
  outputs: [],
  stateMutability: 'nonpayable',
}];

async function anchorIdentity(identityHash: string, privateKey: string) {
  const account = privateKeyToAccount(privateKey as `0x${string}`);

  const walletClient = createWalletClient({
    account,
    chain: base,
    transport: http('https://mainnet.base.org'),
  });

  const hash = await walletClient.writeContract({
    address: CONTRACT_ADDRESS,
    abi: ABI,
    functionName: 'anchorIdentity',
    args: [identityHash as `0x${string}`],
  });

  console.log('Transaction hash:', hash);
  return hash;
}
```

### Using Foundry (cast)

```bash
cast send 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa \
  "anchorIdentity(bytes32)" \
  0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b \
  --rpc-url https://mainnet.base.org \
  --private-key $PRIVATE_KEY
```

## Batch Anchoring

Anchor multiple identities in one transaction:

```javascript
const hashes = [
  '0x7a8b9c0d...',
  '0x3f2e1d4c...',
  '0x9e8f7a6b...'
];

const tx = await contract.batchAnchor(hashes);
```

### Gas Savings

| Method | Approx Gas | Notes |
|--------|------------|-------|
| Single anchor | ~50,000 | Per transaction |
| Batch (5) | ~150,000 | ~30,000 per hash |
| Batch (10) | ~280,000 | ~28,000 per hash |

## Transaction Costs

Typical costs on Base Mainnet:

| Operation | Gas Used | Cost (@ 0.01 gwei) |
|-----------|----------|-------------------|
| Single anchor | ~50,000 | ~$0.001 |
| Batch (10) | ~280,000 | ~$0.005 |
| Revoke | ~30,000 | ~$0.0006 |

*Costs vary with network congestion*

## Revocation

Identities can be revoked by the creator or contract owner:

```javascript
// Revoke an identity
await contract.revokeIdentity(identityHash);
```

### Revocation Effects

| Before Revoke | After Revoke |
|---------------|--------------|
| `verifyIdentity()` returns `true` | Returns `false` |
| Identity is "valid" | Identity is "invalid" |
| `revokedAt` is `0` | `revokedAt` is timestamp |

### Who Can Revoke

- **Creator**: The address that anchored the identity
- **Contract Owner**: The AgentID admin address

### Revocation is Permanent

Once revoked, an identity cannot be un-revoked. This is by design.

## Events

The contract emits events for indexing:

### IdentityAnchored

```solidity
event IdentityAnchored(
    bytes32 indexed identityHash,
    address indexed creator,
    uint256 timestamp
);
```

### IdentityRevoked

```solidity
event IdentityRevoked(
    bytes32 indexed identityHash,
    address indexed revoker,
    uint256 timestamp
);
```

### Listening for Events

```javascript
contract.on('IdentityAnchored', (hash, creator, timestamp) => {
  console.log(`New identity: ${hash} by ${creator}`);
});
```

## Security Considerations

### Private Key Safety

- **Never** commit private keys to git
- Use environment variables or secret managers
- Consider hardware wallets for production

### Transaction Verification

Always verify the transaction succeeded:

```javascript
const receipt = await tx.wait();
if (receipt.status !== 1) {
  throw new Error('Transaction failed');
}
```

### Front-Running

Anyone can see pending transactions. For sensitive operations:
- Use private mempools if available
- Submit transactions during low-activity periods
- Consider commit-reveal schemes for high-value operations

## Troubleshooting

### "Already anchored"

The identity hash already exists on-chain. This is expected if:
- You're re-anchoring the same agent
- Someone else anchored the same configuration

### "Insufficient funds"

You need ETH on Base for gas. Get Base ETH from:
- Bridge from Ethereum Mainnet
- Exchanges that support Base

### "Transaction reverted"

Check:
- Hash format is valid (0x + 64 hex chars)
- Hash is not already anchored
- You have enough gas

## Next Steps

- [Verification](verification.md) - How to verify anchored identities
- [Smart Contract Functions](../smart-contract/functions.md) - Full contract reference
- [Events](../smart-contract/events.md) - Contract events
