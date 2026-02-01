# Smart Contract

The AgentID smart contract is deployed on Base Mainnet and provides on-chain storage and verification of agent identity hashes.

## Contract Information

| Property | Value |
|----------|-------|
| **Name** | Agent007Registry |
| **Network** | Base Mainnet |
| **Chain ID** | 8453 |
| **Address** | `0x471C4c43672be2d49A2ceC79203c23b7194A22Fa` |
| **Explorer** | [BaseScan](https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa) |

## Contract Purpose

The contract serves as a **registry** for agent identity hashes:

```
+------------------+                    +------------------+
|  Agent Config    |  compute hash      |  Smart Contract  |
|  (off-chain)     |  --------------->  |  (on-chain)      |
+------------------+                    +------------------+
                                               |
                                               | stores
                                               v
                                        +-------------+
                                        | - hash      |
                                        | - creator   |
                                        | - timestamp |
                                        | - revoked?  |
                                        +-------------+
```

## What It Does

- **Anchors** identity hashes with timestamps
- **Stores** creator address for each identity
- **Verifies** whether a hash is valid (exists and not revoked)
- **Revokes** identities when needed
- **Tracks** statistics (total anchored, revoked, active)

## What It Does NOT Do

- Store agent configurations (privacy)
- Store system prompts (privacy)
- Store API keys (security)
- Execute agent logic (different purpose)
- Handle payments/tokens (not a financial contract)

## Identity Structure

Each identity is stored as:

```solidity
struct Identity {
    bytes32 identityHash;   // SHA-256 hash of agent config
    address creator;        // Address that anchored it
    uint256 anchoredAt;     // Unix timestamp when anchored
    uint256 revokedAt;      // Unix timestamp when revoked (0 if active)
    bool exists;            // Whether the identity exists
}
```

## Contract Interface

### Write Functions

| Function | Description |
|----------|-------------|
| `anchorIdentity(bytes32)` | Anchor a single identity |
| `batchAnchor(bytes32[])` | Anchor multiple identities |
| `revokeIdentity(bytes32)` | Revoke an identity |
| `transferOwnership(address)` | Transfer contract ownership |

### Read Functions

| Function | Description |
|----------|-------------|
| `verifyIdentity(bytes32)` | Check if identity is valid |
| `getIdentity(bytes32)` | Get full identity details |
| `getStats()` | Get registry statistics |
| `getIdentityHashByIndex(uint256)` | Get hash by array index |
| `getIdentityCount()` | Get total number of hashes |

### State Variables

| Variable | Type | Description |
|----------|------|-------------|
| `owner` | address | Contract owner |
| `identities` | mapping | Hash to Identity mapping |
| `allIdentityHashes` | bytes32[] | Array of all hashes |
| `totalAnchored` | uint256 | Total anchored count |
| `totalRevoked` | uint256 | Total revoked count |

## Gas Costs

Approximate gas costs on Base:

| Operation | Gas Units | Cost (@ 0.01 gwei) |
|-----------|-----------|-------------------|
| `anchorIdentity` | ~50,000 | ~$0.001 |
| `batchAnchor(5)` | ~150,000 | ~$0.003 |
| `batchAnchor(10)` | ~280,000 | ~$0.005 |
| `revokeIdentity` | ~30,000 | ~$0.0006 |
| `verifyIdentity` | ~2,500 | Free (view) |
| `getIdentity` | ~3,000 | Free (view) |

*Costs vary with network congestion*

## Security Features

### Access Control

- **Anchoring**: Anyone can anchor (permissionless)
- **Revocation**: Only creator or owner can revoke
- **Ownership**: Only owner can transfer ownership

### Immutability

- Anchored hashes cannot be modified
- Timestamps cannot be changed
- Creator addresses cannot be changed
- Revocations are permanent

### Input Validation

- Rejects zero hash (`bytes32(0)`)
- Rejects duplicate anchoring
- Validates array bounds

## Interacting with the Contract

### Using Ethers.js

```javascript
import { ethers } from 'ethers';

const CONTRACT_ADDRESS = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';
const ABI = [
  'function anchorIdentity(bytes32 identityHash) external',
  'function verifyIdentity(bytes32 identityHash) view returns (bool)',
  'function getIdentity(bytes32 identityHash) view returns (bool exists, address creator, uint256 anchoredAt, uint256 revokedAt, bool isValid)',
  'function getStats() view returns (uint256 anchored, uint256 revoked, uint256 active)',
  'event IdentityAnchored(bytes32 indexed identityHash, address indexed creator, uint256 timestamp)'
];

// Read (no wallet needed)
const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

const isValid = await contract.verifyIdentity('0x...');
const [exists, creator, anchoredAt, revokedAt, valid] = await contract.getIdentity('0x...');

// Write (wallet needed)
const wallet = new ethers.Wallet(privateKey, provider);
const contractWithSigner = contract.connect(wallet);
const tx = await contractWithSigner.anchorIdentity('0x...');
await tx.wait();
```

### Using Foundry

```bash
# Read
cast call 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa \
  "verifyIdentity(bytes32)(bool)" \
  0x7a8b9c0d... \
  --rpc-url https://mainnet.base.org

# Write
cast send 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa \
  "anchorIdentity(bytes32)" \
  0x7a8b9c0d... \
  --rpc-url https://mainnet.base.org \
  --private-key $PRIVATE_KEY
```

### Using BaseScan

1. Go to [Contract on BaseScan](https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa#readContract)
2. Click "Read Contract" for queries
3. Click "Write Contract" for transactions (requires wallet)

## Source Code

The contract is verified on BaseScan. Key sections:

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

contract Agent007Registry {
    struct Identity {
        bytes32 identityHash;
        address creator;
        uint256 anchoredAt;
        uint256 revokedAt;
        bool exists;
    }

    address public owner;
    mapping(bytes32 => Identity) public identities;
    bytes32[] public allIdentityHashes;
    uint256 public totalAnchored;
    uint256 public totalRevoked;

    event IdentityAnchored(bytes32 indexed identityHash, address indexed creator, uint256 timestamp);
    event IdentityRevoked(bytes32 indexed identityHash, address indexed revoker, uint256 timestamp);

    function anchorIdentity(bytes32 identityHash) external {
        require(identityHash != bytes32(0), "Invalid hash");
        require(!identities[identityHash].exists, "Already anchored");

        identities[identityHash] = Identity({
            identityHash: identityHash,
            creator: msg.sender,
            anchoredAt: block.timestamp,
            revokedAt: 0,
            exists: true
        });

        allIdentityHashes.push(identityHash);
        totalAnchored++;

        emit IdentityAnchored(identityHash, msg.sender, block.timestamp);
    }

    function verifyIdentity(bytes32 identityHash) external view returns (bool valid) {
        Identity memory identity = identities[identityHash];
        return identity.exists && identity.revokedAt == 0;
    }

    // ... additional functions
}
```

## Contract Upgrades

The current contract is **not upgradeable**. This is intentional:

- Immutability guarantees data permanence
- No admin can change contract logic
- Anchored data is truly immutable

Future versions may be deployed to new addresses with migration tools.

## Detailed Documentation

- [Functions](functions.md) - Complete function reference
- [Events](events.md) - Event documentation

## Support

- **Issues**: GitHub repository
- **Security**: security@agentid.xyz
- **General**: support@agentid.xyz
