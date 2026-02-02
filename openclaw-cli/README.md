# AgentID CLI for OpenClaw

Register your OpenClaw agents on AgentID - the decentralized identity layer for AI agents on Base blockchain.

## Installation

```bash
# Via npm (global)
npm install -g agentid-openclaw

# Or use directly with npx
npx agentid-openclaw register
```

## Quick Start

```bash
# Register your agent (auto-detects OpenClaw config)
agentid-openclaw register

# Check status
agentid-openclaw status

# Verify any agent
agentid-openclaw verify 0x7a8b9c...
```

## Commands

### `register`

Register your OpenClaw agent with AgentID.

```bash
agentid-openclaw register [options]

Options:
  -n, --name <name>    Agent name (overrides ~/.openclaw/openclaw.json)
  -m, --model <model>  Model identifier (e.g., anthropic/claude-opus-4-5)
  -f, --force          Force re-registration
  -w, --wallet         Sign with MetaMask wallet (higher trust score)
```

#### Signing Methods

**Agent Keypair (default):**
```bash
agentid-openclaw register
```
- Generates Ed25519 keypair automatically
- Trust score: 0.3
- No browser required

**Wallet Signing (recommended):**
```bash
agentid-openclaw register --wallet
```
- Opens browser for MetaMask signing
- Trust score: 0.5
- Proves human ownership

**What happens:**

1. Reads your OpenClaw config from `~/.openclaw/openclaw.json`
2. Generates an Ed25519 keypair (stored in `~/.agentid/`)
3. Signs a registration message
4. Submits to AgentID API
5. Identity is anchored on Base blockchain

**Output:**

```
  AgentID - OpenClaw Registration

✔ OpenClaw configuration found
  Agent: My Assistant
  Model: anthropic/claude-opus-4-5
  Skills: web-search, code-review
✔ Keypair ready
  Public Key: MCowBQYDK2VwAyEA...
✔ Message signed
✔ Registered on AgentID!

  Registration Successful!

  Identity Hash:
  0x7a8b9c4d5e6f7890abcdef1234567890abcdef1234567890abcdef1234567890

  Verify URL:
  https://id-agent.org/verify/0x7a8b9c...

  Trust Score: 0.35
  Self-registered agent with Ed25519 keypair

  Badge (for README):
  [![AgentID Verified](https://id-agent.org/badge/0x7a8b9c...)](...)
```

### `status`

Check your current registration status.

```bash
agentid-openclaw status
```

### `verify <hash>`

Verify any agent's identity.

```bash
agentid-openclaw verify 0x7a8b9c4d5e6f7890...
```

### `proofs [hash]`

View verification proofs for an identity.

```bash
# View your proofs
agentid-openclaw proofs

# View another agent's proofs
agentid-openclaw proofs 0x7a8b9c...
```

## Configuration

The CLI auto-detects your OpenClaw configuration from:

```
~/.openclaw/openclaw.json
```

### Environment Variables

```bash
# Custom API URL (defaults to production)
export AGENTID_API_URL="https://agent007-api-production.up.railway.app"
```

### Files Created

```
~/.agentid/
├── openclaw-keypair.json   # Your Ed25519 keypair (keep private!)
└── identity.json           # Your registered identity
```

## Trust Scores

| Method | Score | Description |
|--------|-------|-------------|
| Wallet signing (`--wallet`) | 0.5 | Human wallet signature via MetaMask |
| Agent keypair (default) | 0.3 | Self-registered with Ed25519 |
| + Skills detected | +0.05 | OpenClaw skills in config |
| + System prompt hash | +0.1 | Config fingerprint |

Use `--wallet` for higher trust scores (requires browser + MetaMask).

## Security

- Your private key is stored in `~/.agentid/openclaw-keypair.json` with mode 0600
- Never share your private key
- The public key is safe to share and is used to verify your identity

## Links

- [AgentID Website](https://id-agent.org)
- [AgentID Documentation](https://id-agent.org/docs)
- [OpenClaw](https://openclaw.ai)

## License

MIT
