# Contract Functions

Complete reference for all Agent007Registry smart contract functions.

## Write Functions

### anchorIdentity

Anchor a single identity hash on-chain.

```solidity
function anchorIdentity(bytes32 identityHash) external
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `identityHash` | bytes32 | SHA-256 hash of agent configuration |

#### Requirements

- `identityHash` must not be zero (`bytes32(0)`)
- `identityHash` must not already be anchored

#### Gas Cost

~50,000 gas units

#### Events Emitted

- `IdentityAnchored(identityHash, msg.sender, block.timestamp)`

#### Example

```javascript
// ethers.js
const tx = await contract.anchorIdentity(
  '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b'
);
await tx.wait();
```

```bash
# Foundry
cast send $CONTRACT "anchorIdentity(bytes32)" 0x7a8b9c0d... --private-key $KEY
```

#### Errors

| Error | Cause |
|-------|-------|
| `"Invalid hash"` | Zero hash provided |
| `"Already anchored"` | Hash already exists |

---

### batchAnchor

Anchor multiple identity hashes in a single transaction.

```solidity
function batchAnchor(bytes32[] calldata hashes) external
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `hashes` | bytes32[] | Array of identity hashes |

#### Behavior

- Skips invalid hashes (zero) silently
- Skips already-anchored hashes silently
- Anchors all valid, new hashes

#### Gas Cost

~30,000 per hash (after first) due to storage savings

| Count | Approx Gas |
|-------|------------|
| 1 | 50,000 |
| 5 | 150,000 |
| 10 | 280,000 |
| 20 | 540,000 |

#### Events Emitted

- `IdentityAnchored` for each successfully anchored hash

#### Example

```javascript
const hashes = [
  '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
  '0x3f2e1d4c5b6a7980f1e2d3c4b5a69870e1f2d3c4b5a69870f1e2d3c4b5a69870',
  '0x9e8f7a6b5c4d3e2f1a0b9c8d7e6f5a4b3c2d1e0f9a8b7c6d5e4f3a2b1c0d9e8f'
];

const tx = await contract.batchAnchor(hashes);
await tx.wait();
```

#### Best Practices

- Batch size of 10-20 for optimal gas efficiency
- Filter out known-anchored hashes before calling
- Handle partial failures by checking events

---

### revokeIdentity

Revoke an anchored identity.

```solidity
function revokeIdentity(bytes32 identityHash) external
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `identityHash` | bytes32 | Hash to revoke |

#### Requirements

- Identity must exist
- Identity must not already be revoked
- Caller must be creator OR contract owner

#### Effects

- Sets `revokedAt` to current timestamp
- Increments `totalRevoked`
- `verifyIdentity()` will return `false`

#### Gas Cost

~30,000 gas units

#### Events Emitted

- `IdentityRevoked(identityHash, msg.sender, block.timestamp)`

#### Example

```javascript
const tx = await contract.revokeIdentity('0x7a8b9c0d...');
await tx.wait();
```

#### Errors

| Error | Cause |
|-------|-------|
| `"Not found"` | Identity doesn't exist |
| `"Already revoked"` | Identity already revoked |
| `"Not authorized"` | Caller not creator or owner |

#### Important Notes

- Revocation is **permanent** and cannot be undone
- Revoked identities remain in storage (for audit)
- `getIdentity()` still returns data for revoked identities

---

### transferOwnership

Transfer contract ownership to a new address.

```solidity
function transferOwnership(address newOwner) external
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `newOwner` | address | New owner address |

#### Requirements

- Caller must be current owner
- `newOwner` must not be zero address

#### Events Emitted

- `OwnershipTransferred(previousOwner, newOwner)`

#### Example

```javascript
const tx = await contract.transferOwnership('0xNewOwner...');
await tx.wait();
```

#### Errors

| Error | Cause |
|-------|-------|
| `"Not owner"` | Caller is not owner |
| `"Invalid address"` | New owner is zero address |

---

## Read Functions

### verifyIdentity

Check if an identity hash is valid (exists and not revoked).

```solidity
function verifyIdentity(bytes32 identityHash) external view returns (bool valid)
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `identityHash` | bytes32 | Hash to verify |

#### Returns

| Name | Type | Description |
|------|------|-------------|
| `valid` | bool | True if exists AND not revoked |

#### Gas Cost

~2,500 gas units (free for external calls)

#### Example

```javascript
const isValid = await contract.verifyIdentity('0x7a8b9c0d...');
console.log('Valid:', isValid); // true or false
```

```bash
# Foundry
cast call $CONTRACT "verifyIdentity(bytes32)(bool)" 0x7a8b9c0d...
```

#### Return Values

| State | Returns |
|-------|---------|
| Not anchored | `false` |
| Anchored, active | `true` |
| Anchored, revoked | `false` |

---

### getIdentity

Get full details for an identity hash.

```solidity
function getIdentity(bytes32 identityHash) external view returns (
    bool exists,
    address creator,
    uint256 anchoredAt,
    uint256 revokedAt,
    bool isValid
)
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `identityHash` | bytes32 | Hash to query |

#### Returns

| Name | Type | Description |
|------|------|-------------|
| `exists` | bool | Whether identity is anchored |
| `creator` | address | Address that anchored it |
| `anchoredAt` | uint256 | Unix timestamp of anchoring |
| `revokedAt` | uint256 | Unix timestamp of revocation (0 if active) |
| `isValid` | bool | exists AND revokedAt == 0 |

#### Gas Cost

~3,000 gas units (free for external calls)

#### Example

```javascript
const [exists, creator, anchoredAt, revokedAt, isValid] =
  await contract.getIdentity('0x7a8b9c0d...');

console.log({
  exists,
  creator,
  anchoredAt: new Date(Number(anchoredAt) * 1000),
  revoked: revokedAt > 0,
  isValid
});
```

```bash
# Foundry
cast call $CONTRACT \
  "getIdentity(bytes32)(bool,address,uint256,uint256,bool)" \
  0x7a8b9c0d...
```

---

### getStats

Get registry statistics.

```solidity
function getStats() external view returns (
    uint256 anchored,
    uint256 revoked,
    uint256 active
)
```

#### Returns

| Name | Type | Description |
|------|------|-------------|
| `anchored` | uint256 | Total identities ever anchored |
| `revoked` | uint256 | Total identities revoked |
| `active` | uint256 | Currently active (anchored - revoked) |

#### Example

```javascript
const [anchored, revoked, active] = await contract.getStats();
console.log(`Active: ${active} / ${anchored} total (${revoked} revoked)`);
```

```bash
# Foundry
cast call $CONTRACT "getStats()(uint256,uint256,uint256)"
```

---

### getIdentityHashByIndex

Get an identity hash by its array index.

```solidity
function getIdentityHashByIndex(uint256 index) external view returns (bytes32)
```

#### Parameters

| Name | Type | Description |
|------|------|-------------|
| `index` | uint256 | Index in allIdentityHashes array |

#### Returns

| Type | Description |
|------|-------------|
| bytes32 | Identity hash at that index |

#### Errors

| Error | Cause |
|-------|-------|
| `"Index out of bounds"` | Index >= array length |

#### Example

```javascript
// Iterate through all identities
const count = await contract.getIdentityCount();
for (let i = 0; i < count; i++) {
  const hash = await contract.getIdentityHashByIndex(i);
  console.log(`Identity ${i}: ${hash}`);
}
```

---

### getIdentityCount

Get the total count of anchored identities.

```solidity
function getIdentityCount() external view returns (uint256)
```

#### Returns

| Type | Description |
|------|-------------|
| uint256 | Length of allIdentityHashes array |

#### Note

This equals `totalAnchored` but reads from the array length.

#### Example

```javascript
const count = await contract.getIdentityCount();
console.log(`Total identities: ${count}`);
```

---

### owner

Get the current contract owner.

```solidity
function owner() external view returns (address)
```

#### Returns

| Type | Description |
|------|-------------|
| address | Current owner address |

---

### identities

Direct mapping access to identity data.

```solidity
function identities(bytes32 identityHash) external view returns (
    bytes32 identityHash,
    address creator,
    uint256 anchoredAt,
    uint256 revokedAt,
    bool exists
)
```

#### Note

Use `getIdentity()` instead for computed `isValid` field.

---

### allIdentityHashes

Direct array access to identity hashes.

```solidity
function allIdentityHashes(uint256 index) external view returns (bytes32)
```

#### Note

Use `getIdentityHashByIndex()` instead for bounds checking.

---

### totalAnchored

Get total anchored count.

```solidity
function totalAnchored() external view returns (uint256)
```

---

### totalRevoked

Get total revoked count.

```solidity
function totalRevoked() external view returns (uint256)
```

---

## Function Selectors

For low-level calls:

| Function | Selector |
|----------|----------|
| `anchorIdentity(bytes32)` | `0x4b1894d0` |
| `batchAnchor(bytes32[])` | `0x8a17e2f1` |
| `revokeIdentity(bytes32)` | `0x7a4c8e2b` |
| `verifyIdentity(bytes32)` | `0x2a8e0d28` |
| `getIdentity(bytes32)` | `0x9c4e9a2f` |
| `getStats()` | `0xc59d4847` |

---

## Full ABI

```json
[
  {
    "inputs": [{"name": "identityHash", "type": "bytes32"}],
    "name": "anchorIdentity",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "hashes", "type": "bytes32[]"}],
    "name": "batchAnchor",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "identityHash", "type": "bytes32"}],
    "name": "revokeIdentity",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "newOwner", "type": "address"}],
    "name": "transferOwnership",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "identityHash", "type": "bytes32"}],
    "name": "verifyIdentity",
    "outputs": [{"name": "valid", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "identityHash", "type": "bytes32"}],
    "name": "getIdentity",
    "outputs": [
      {"name": "exists", "type": "bool"},
      {"name": "creator", "type": "address"},
      {"name": "anchoredAt", "type": "uint256"},
      {"name": "revokedAt", "type": "uint256"},
      {"name": "isValid", "type": "bool"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getStats",
    "outputs": [
      {"name": "anchored", "type": "uint256"},
      {"name": "revoked", "type": "uint256"},
      {"name": "active", "type": "uint256"}
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [{"name": "index", "type": "uint256"}],
    "name": "getIdentityHashByIndex",
    "outputs": [{"type": "bytes32"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "getIdentityCount",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "owner",
    "outputs": [{"type": "address"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalAnchored",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [],
    "name": "totalRevoked",
    "outputs": [{"type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
]
```
