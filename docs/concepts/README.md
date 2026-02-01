# Core Concepts

This section explains the fundamental concepts behind AgentID.

## The Problem

AI agents present a unique verification challenge:

```
                    BEFORE AgentID

User                          Agent
  |                             |
  |   "I am HelpBot v2.0"       |
  | <-------------------------- |
  |                             |
  |   How do I verify this?     |
  |   - System prompt?          |
  |   - Model config?           |
  |   - Has it changed?         |
  |                             |
  |   NO WAY TO KNOW            |
  |                             |
```

Traditional identity systems don't work for AI:
- **Passwords**: Agents don't have secrets
- **Certificates**: Who is the certificate authority?
- **OAuth**: Agents aren't users
- **API Keys**: Only prove access, not identity

## The Solution

AgentID provides **cryptographic identity** for AI agents:

```
                    WITH AgentID

User                          Agent
  |                             |
  |   "I am HelpBot v2.0"       |
  |   Hash: 0x7a8b9c...         |
  | <-------------------------- |
  |                             |
  |   Verify on-chain:          |
  |   - Hash exists? YES        |
  |   - Anchored when? Jan 15   |
  |   - Revoked? NO             |
  |   - Creator? 0xAcme...      |
  |                             |
  |   VERIFIED                  |
  |                             |
```

## Key Concepts

### 1. Identity Hash

Every agent has a unique **identity hash** computed from its configuration:

```
Agent Configuration          Identity Hash
+------------------+        +------------------+
| System Prompt    |  --->  |                  |
| Model Config     |  SHA   | 0x7a8b9c0d1e2f.. |
| Parameters       |  256   |                  |
| Tools            |  --->  | (32 bytes)       |
+------------------+        +------------------+
```

The hash is deterministic - the same configuration always produces the same hash.

[Learn more about Identity Hash](identity-hash.md)

### 2. On-Chain Anchoring

Identity hashes are **anchored** on Base Mainnet blockchain:

```
+------------------+         +------------------+
| Identity Hash    |  --->   | Smart Contract   |
| 0x7a8b9c...      |  txn    | - Hash stored    |
+------------------+         | - Timestamp      |
                             | - Creator addr   |
                             +------------------+
```

This creates an immutable, timestamped record that anyone can verify.

[Learn more about On-Chain Anchoring](on-chain-anchoring.md)

### 3. Independent Verification

Anyone can verify an identity without trusting AgentID:

```
            Verification Path

+--------+     +-----------+     +------------+
| User   | --> | Any RPC   | --> | Base Chain |
+--------+     | (public)  |     +------------+
                    |                  |
                    v                  v
              No API keys        Immutable data
              No accounts        Trustless query
              No permissions     Cryptographic proof
```

[Learn more about Verification](verification.md)

## The Trust Model

AgentID's trust model is based on cryptographic verification, not authority:

### What AgentID Guarantees

| Guarantee | Description |
|-----------|-------------|
| **Hash Integrity** | The hash was computed from specific configuration |
| **Timestamp Proof** | When the hash was first anchored |
| **Creator Identity** | Which address anchored it |
| **Immutability** | The anchored data cannot be changed |

### What AgentID Does NOT Guarantee

| NOT Guaranteed | Why |
|----------------|-----|
| Agent behavior | Hash proves config, not runtime behavior |
| Agent quality | A verified agent might still be poorly designed |
| API key security | Hash doesn't include actual API keys |
| Uptime/availability | AgentID doesn't run your agent |

## Identity Lifecycle

```
      1. CREATE             2. ANCHOR            3. VERIFY
         |                     |                    |
         v                     v                    v
    +---------+          +---------+          +---------+
    | Config  |   --->   | Hash on |   --->   | Anyone  |
    | agent   |   hash   | Base    |   query  | can     |
    | .json   |   +txn   | Mainnet |          | verify  |
    +---------+          +---------+          +---------+
         |                     |                    |
         |                     |                    |
         v                     v                    v
    OPTIONAL             OPTIONAL             ALWAYS

    +---------+          +---------+
    | Modify  |          | Revoke  |
    | (new    |          | (old    |
    | hash)   |          | invalid)|
    +---------+          +---------+
```

### States

| State | Description |
|-------|-------------|
| **Unregistered** | No identity hash exists for this config |
| **Pending** | Registered with API, not yet anchored |
| **Anchored** | Hash exists on-chain, active |
| **Revoked** | Hash exists but marked as revoked |

## Configuration Components

An agent's identity is computed from:

### System Prompt
The text that defines the agent's behavior, role, and constraints.

### Model Configuration
- Provider (anthropic, openai, etc.)
- Model ID (claude-3-5-sonnet, gpt-4, etc.)
- API endpoint

### Generation Parameters
- Temperature
- Max tokens
- Top-p, top-k
- Stop sequences

### Tools (Optional)
- Tool names
- Tool descriptions
- Parameter schemas

## Security Properties

### Collision Resistance

SHA-256 makes it computationally infeasible to:
- Find two configurations with the same hash
- Create a configuration for a specific hash

### Tamper Evidence

Any change to the configuration produces a completely different hash:

```
Original:    "You are helpful..."  -> 0x7a8b9c...
Modified:    "You are helpful.."   -> 0x3f2e1d...  (completely different!)
                              ^
                          one char removed
```

### Non-Repudiation

Once anchored, the creator address is permanently linked:
- Cannot deny creating the identity
- Cannot transfer creation to another address
- Cannot modify the timestamp

## Comparison with Alternatives

| Feature | AgentID | X.509 Certs | OAuth | API Keys |
|---------|---------|-------------|-------|----------|
| Verifiable config | Yes | No | No | No |
| Decentralized | Yes | No | No | No |
| No authority needed | Yes | No | No | No |
| Timestamped proof | Yes | Yes | No | No |
| Open protocol | Yes | Yes | No | No |
| AI-specific | Yes | No | No | No |

## Next Steps

- [Identity Hash Deep Dive](identity-hash.md)
- [On-Chain Anchoring](on-chain-anchoring.md)
- [Verification Process](verification.md)
