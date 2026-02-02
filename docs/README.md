# AgentID

> 🔐 **Cryptographic Identity for AI Agents** — Live on Base Mainnet

[![Contract](https://img.shields.io/badge/Contract-Verified-green)](https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa)
[![npm](https://img.shields.io/npm/v/agentidbase)](https://www.npmjs.com/package/agentidbase)

AgentID is an open-source system that provides cryptographic identities for AI agents. It creates immutable, verifiable proof that an agent's configuration has not been modified since registration.

## What is AgentID?

AgentID solves a fundamental problem in AI: **How do you prove an AI agent is who it claims to be?**

When you interact with an AI agent, you have no way to verify:
- That its system prompt hasn't been changed
- That its configuration matches what was originally declared
- That it's still the same agent you trusted yesterday

AgentID provides:

```
+------------------+     +-----------------+     +------------------+
|  Agent Config    | --> |   SHA-256 Hash  | --> |  On-Chain Anchor |
|  (prompt, tools) |     |   (identity)    |     |  (Base Mainnet)  |
+------------------+     +-----------------+     +------------------+
                                                          |
                                                          v
                                              +------------------------+
                                              |  Independent Verify    |
                                              |  (anyone, anytime)     |
                                              +------------------------+
```

## Key Concepts

### Identity Hash

Every agent has a unique identity hash computed from:
- System prompt
- Model configuration (provider, model ID)
- Generation parameters (temperature, max tokens)
- Tool definitions
- Behavioral constraints

Any change to any component produces a completely different hash.

### On-Chain Anchoring

Identity hashes are anchored on **Base Mainnet** (Chain ID: 8453). This creates:
- **Timestamp proof**: When the identity was registered
- **Immutability**: The hash cannot be modified
- **Transparency**: Anyone can verify

### Independent Verification

Verification is permissionless. You don't need to trust AgentID to verify an agent:
- Query the blockchain directly
- Use any Ethereum client
- No API keys required

## Quick Links

- [Getting Started](getting-started/README.md) - Install the CLI and register your first agent
- [Concepts](concepts/README.md) - Understand how AgentID works
- [CLI Reference](cli/README.md) - Complete CLI documentation
- [API Reference](api/README.md) - REST API documentation
- [Smart Contract](smart-contract/README.md) - On-chain contract details
- [FAQ](faq.md) - Frequently asked questions

## Contract Information

| Property | Value |
|----------|-------|
| **Network** | Base Mainnet |
| **Chain ID** | 8453 |
| **Contract** | `0x471C4c43672be2d49A2ceC79203c23b7194A22Fa` |
| **Explorer** | [BaseScan](https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa) |

## CLI Installation

```bash
npx agentidbase
```

Or install globally:

```bash
npm install -g agentidbase
```

## Example Usage

```bash
# Create agent configuration
npx agentidbase init

# Register and anchor on-chain
npx agentidbase register --config agent.json

# Verify any agent
npx agentidbase verify 0x1234567890abcdef...
```

## Why AgentID?

### For Agent Developers

- **Trust**: Build trust with users by proving your agent is authentic
- **Accountability**: Demonstrate your agent hasn't been tampered with
- **Transparency**: Show exactly what your agent is configured to do

### For Agent Users

- **Verification**: Confirm an agent is what it claims to be
- **Security**: Detect if an agent has been modified
- **Independence**: Verify without trusting any third party

### For Platforms

- **Audit Trail**: Track agent configurations over time
- **Compliance**: Prove agent behavior hasn't changed
- **Integration**: Simple API for identity verification

## Not a Token

AgentID is **not** a cryptocurrency, NFT, or financial instrument. It is:
- A registry of identity hashes
- A verification system
- An open protocol

There are no tokens, no trading, no speculation.

## Open Source

AgentID is fully open source under the MIT license:
- [GitHub Repository](https://github.com/agentid/agentid)
- [Smart Contract](https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa#code)
- [CLI Source](https://github.com/agentid/agentid-cli)

## Community

- [Discord](https://discord.gg/agentid)
- [Twitter](https://twitter.com/agentidbase)
- [GitHub Discussions](https://github.com/agentid/agentid/discussions)

---

Ready to get started? Head to the [Getting Started Guide](getting-started/README.md).
