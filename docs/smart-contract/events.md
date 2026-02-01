# Contract Events

The Agent007Registry contract emits events for all state changes, enabling off-chain indexing and monitoring.

## Events Overview

| Event | Emitted When |
|-------|--------------|
| `IdentityAnchored` | New identity hash anchored |
| `IdentityRevoked` | Identity hash revoked |
| `OwnershipTransferred` | Contract ownership changed |

---

## IdentityAnchored

Emitted when a new identity hash is anchored on-chain.

### Signature

```solidity
event IdentityAnchored(
    bytes32 indexed identityHash,
    address indexed creator,
    uint256 timestamp
);
```

### Parameters

| Name | Type | Indexed | Description |
|------|------|---------|-------------|
| `identityHash` | bytes32 | Yes | The anchored hash |
| `creator` | address | Yes | Address that anchored it |
| `timestamp` | uint256 | No | Block timestamp |

### Topic

```
0x8e3d5a3c... (keccak256("IdentityAnchored(bytes32,address,uint256)"))
```

### Example: Listen with ethers.js

```javascript
import { ethers } from 'ethers';

const CONTRACT = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';
const ABI = [
  'event IdentityAnchored(bytes32 indexed identityHash, address indexed creator, uint256 timestamp)'
];

const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const contract = new ethers.Contract(CONTRACT, ABI, provider);

// Listen for new events
contract.on('IdentityAnchored', (identityHash, creator, timestamp, event) => {
  console.log('New identity anchored!');
  console.log('  Hash:', identityHash);
  console.log('  Creator:', creator);
  console.log('  Time:', new Date(Number(timestamp) * 1000));
  console.log('  Block:', event.log.blockNumber);
  console.log('  Tx:', event.log.transactionHash);
});
```

### Example: Query Historical Events

```javascript
// Get all anchored events from last 1000 blocks
const currentBlock = await provider.getBlockNumber();
const events = await contract.queryFilter(
  contract.filters.IdentityAnchored(),
  currentBlock - 1000,
  currentBlock
);

for (const event of events) {
  console.log({
    hash: event.args.identityHash,
    creator: event.args.creator,
    timestamp: new Date(Number(event.args.timestamp) * 1000),
    block: event.blockNumber,
    tx: event.transactionHash
  });
}
```

### Example: Filter by Creator

```javascript
// Get only events from a specific creator
const myAddress = '0xYourAddress...';
const events = await contract.queryFilter(
  contract.filters.IdentityAnchored(null, myAddress),
  0, // from block
  'latest'
);

console.log(`Found ${events.length} identities created by ${myAddress}`);
```

### Example: Filter by Hash

```javascript
// Get event for a specific hash
const targetHash = '0x7a8b9c0d...';
const events = await contract.queryFilter(
  contract.filters.IdentityAnchored(targetHash),
  0,
  'latest'
);

if (events.length > 0) {
  const event = events[0];
  console.log('Identity was anchored:');
  console.log('  Block:', event.blockNumber);
  console.log('  Creator:', event.args.creator);
}
```

---

## IdentityRevoked

Emitted when an identity is revoked.

### Signature

```solidity
event IdentityRevoked(
    bytes32 indexed identityHash,
    address indexed revoker,
    uint256 timestamp
);
```

### Parameters

| Name | Type | Indexed | Description |
|------|------|---------|-------------|
| `identityHash` | bytes32 | Yes | The revoked hash |
| `revoker` | address | Yes | Address that revoked it |
| `timestamp` | uint256 | No | Block timestamp |

### Example: Monitor Revocations

```javascript
contract.on('IdentityRevoked', (identityHash, revoker, timestamp) => {
  console.log('Identity revoked!');
  console.log('  Hash:', identityHash);
  console.log('  By:', revoker);
  console.log('  Time:', new Date(Number(timestamp) * 1000));

  // Alert if this was an identity you're tracking
  if (trackedHashes.includes(identityHash)) {
    sendAlert(`Tracked identity ${identityHash} was revoked!`);
  }
});
```

### Example: Check if Ever Revoked

```javascript
const events = await contract.queryFilter(
  contract.filters.IdentityRevoked(identityHash),
  0,
  'latest'
);

if (events.length > 0) {
  console.log('This identity was revoked at:');
  console.log('  Block:', events[0].blockNumber);
  console.log('  Time:', new Date(Number(events[0].args.timestamp) * 1000));
} else {
  console.log('This identity has never been revoked');
}
```

---

## OwnershipTransferred

Emitted when contract ownership changes.

### Signature

```solidity
event OwnershipTransferred(
    address indexed previousOwner,
    address indexed newOwner
);
```

### Parameters

| Name | Type | Indexed | Description |
|------|------|---------|-------------|
| `previousOwner` | address | Yes | Previous owner address |
| `newOwner` | address | Yes | New owner address |

### Example: Monitor Ownership Changes

```javascript
contract.on('OwnershipTransferred', (previousOwner, newOwner) => {
  console.log('Contract ownership transferred!');
  console.log('  From:', previousOwner);
  console.log('  To:', newOwner);
});
```

---

## Using Events for Indexing

### Build an Index of All Identities

```javascript
async function buildIdentityIndex() {
  const events = await contract.queryFilter(
    contract.filters.IdentityAnchored(),
    0,
    'latest'
  );

  const revokedEvents = await contract.queryFilter(
    contract.filters.IdentityRevoked(),
    0,
    'latest'
  );

  const revokedHashes = new Set(
    revokedEvents.map(e => e.args.identityHash)
  );

  const index = {};

  for (const event of events) {
    const hash = event.args.identityHash;
    index[hash] = {
      hash,
      creator: event.args.creator,
      anchoredAt: new Date(Number(event.args.timestamp) * 1000),
      anchoredBlock: event.blockNumber,
      anchoredTx: event.transactionHash,
      revoked: revokedHashes.has(hash)
    };
  }

  return index;
}

const identities = await buildIdentityIndex();
console.log(`Indexed ${Object.keys(identities).length} identities`);
```

### Real-Time Sync

```javascript
class IdentityIndexer {
  constructor(contract) {
    this.contract = contract;
    this.identities = new Map();
  }

  async sync() {
    // Load historical events
    const anchoredEvents = await this.contract.queryFilter(
      this.contract.filters.IdentityAnchored(),
      0,
      'latest'
    );

    for (const event of anchoredEvents) {
      this.handleAnchored(event);
    }

    const revokedEvents = await this.contract.queryFilter(
      this.contract.filters.IdentityRevoked(),
      0,
      'latest'
    );

    for (const event of revokedEvents) {
      this.handleRevoked(event);
    }

    // Listen for new events
    this.contract.on('IdentityAnchored', (hash, creator, ts, event) => {
      this.handleAnchored(event);
    });

    this.contract.on('IdentityRevoked', (hash, revoker, ts, event) => {
      this.handleRevoked(event);
    });

    console.log(`Synced ${this.identities.size} identities`);
  }

  handleAnchored(event) {
    this.identities.set(event.args.identityHash, {
      hash: event.args.identityHash,
      creator: event.args.creator,
      anchoredAt: Number(event.args.timestamp),
      block: event.blockNumber,
      revoked: false
    });
  }

  handleRevoked(event) {
    const identity = this.identities.get(event.args.identityHash);
    if (identity) {
      identity.revoked = true;
      identity.revokedAt = Number(event.args.timestamp);
      identity.revokedBy = event.args.revoker;
    }
  }

  get(hash) {
    return this.identities.get(hash);
  }

  getByCreator(creator) {
    return Array.from(this.identities.values())
      .filter(i => i.creator.toLowerCase() === creator.toLowerCase());
  }
}

const indexer = new IdentityIndexer(contract);
await indexer.sync();
```

---

## Event Logs via JSON-RPC

### Get Logs Directly

```bash
curl -X POST https://mainnet.base.org \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_getLogs",
    "params": [{
      "address": "0x471C4c43672be2d49A2ceC79203c23b7194A22Fa",
      "topics": [
        "0x<IdentityAnchored_topic_hash>"
      ],
      "fromBlock": "0x0",
      "toBlock": "latest"
    }]
  }'
```

### Topic Hashes

| Event | Topic 0 |
|-------|---------|
| `IdentityAnchored` | `keccak256("IdentityAnchored(bytes32,address,uint256)")` |
| `IdentityRevoked` | `keccak256("IdentityRevoked(bytes32,address,uint256)")` |
| `OwnershipTransferred` | `keccak256("OwnershipTransferred(address,address)")` |

---

## Subgraph / The Graph

For production indexing, consider using The Graph:

```graphql
# schema.graphql
type Identity @entity {
  id: ID! # identityHash
  creator: Bytes!
  anchoredAt: BigInt!
  anchoredBlock: BigInt!
  anchoredTx: Bytes!
  revoked: Boolean!
  revokedAt: BigInt
  revokedBy: Bytes
}

type Stats @entity {
  id: ID!
  totalAnchored: BigInt!
  totalRevoked: BigInt!
  totalActive: BigInt!
}
```

```typescript
// mapping.ts
import { IdentityAnchored, IdentityRevoked } from '../generated/Agent007Registry/Agent007Registry';
import { Identity, Stats } from '../generated/schema';

export function handleIdentityAnchored(event: IdentityAnchored): void {
  let id = event.params.identityHash.toHexString();
  let identity = new Identity(id);
  identity.creator = event.params.creator;
  identity.anchoredAt = event.params.timestamp;
  identity.anchoredBlock = event.block.number;
  identity.anchoredTx = event.transaction.hash;
  identity.revoked = false;
  identity.save();

  // Update stats
  let stats = Stats.load('global');
  if (!stats) {
    stats = new Stats('global');
    stats.totalAnchored = BigInt.fromI32(0);
    stats.totalRevoked = BigInt.fromI32(0);
    stats.totalActive = BigInt.fromI32(0);
  }
  stats.totalAnchored = stats.totalAnchored.plus(BigInt.fromI32(1));
  stats.totalActive = stats.totalActive.plus(BigInt.fromI32(1));
  stats.save();
}

export function handleIdentityRevoked(event: IdentityRevoked): void {
  let id = event.params.identityHash.toHexString();
  let identity = Identity.load(id);
  if (identity) {
    identity.revoked = true;
    identity.revokedAt = event.params.timestamp;
    identity.revokedBy = event.params.revoker;
    identity.save();
  }

  // Update stats
  let stats = Stats.load('global');
  if (stats) {
    stats.totalRevoked = stats.totalRevoked.plus(BigInt.fromI32(1));
    stats.totalActive = stats.totalActive.minus(BigInt.fromI32(1));
    stats.save();
  }
}
```

---

## Webhook Integration

Send events to your server:

```javascript
const express = require('express');
const { ethers } = require('ethers');

const app = express();

// Setup contract listener
const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const contract = new ethers.Contract(CONTRACT, ABI, provider);

contract.on('IdentityAnchored', async (hash, creator, timestamp, event) => {
  // Forward to webhook consumers
  const payload = {
    event: 'identity.anchored',
    data: {
      identityHash: hash,
      creator,
      timestamp: Number(timestamp),
      block: event.log.blockNumber,
      tx: event.log.transactionHash
    }
  };

  for (const subscriber of webhookSubscribers) {
    await fetch(subscriber.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Signature': sign(payload, subscriber.secret)
      },
      body: JSON.stringify(payload)
    });
  }
});

app.listen(3000);
```

---

## Best Practices

### 1. Handle Chain Reorgs

```javascript
// Store events with confirmation count
async function handleEvent(event) {
  const confirmations = await event.getBlock().then(
    b => provider.getBlockNumber() - b.number
  );

  if (confirmations >= 12) {
    // Safe to consider final
    persistEvent(event);
  } else {
    // Queue for re-check
    pendingEvents.push({ event, checkAt: Date.now() + 60000 });
  }
}
```

### 2. Efficient Querying

```javascript
// Batch queries by block range
const BATCH_SIZE = 10000;

async function getAllEvents() {
  const currentBlock = await provider.getBlockNumber();
  const events = [];

  for (let from = 0; from < currentBlock; from += BATCH_SIZE) {
    const to = Math.min(from + BATCH_SIZE - 1, currentBlock);
    const batch = await contract.queryFilter(
      contract.filters.IdentityAnchored(),
      from,
      to
    );
    events.push(...batch);
  }

  return events;
}
```

### 3. Error Handling

```javascript
contract.on('error', (error) => {
  console.error('Contract event error:', error);
  // Reconnect logic
  setTimeout(() => {
    reconnect();
  }, 5000);
});
```
