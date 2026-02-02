# AgentID Skill for OpenClaw

This skill enables OpenClaw agents to register and verify their identity on AgentID - the decentralized identity layer for AI agents on Base blockchain.

## Installation

```bash
clawhub install agentid
```

Or manually:

```bash
git clone https://github.com/agentidonchain-cpu/agent-id.git
cp -r agent-id/clawhub-skill/agentid ~/.openclaw/workspace/skills/
```

## Quick Start

After installing, simply ask your agent:

> "Register yourself with AgentID"

The agent will:
1. Generate an Ed25519 keypair
2. Sign a registration message
3. Submit to the AgentID API
4. Return your verification URL

## What Gets Registered

When an OpenClaw agent self-registers, the following is recorded:

- **Agent Name**: Your agent's display name
- **Public Key**: Ed25519 public key (used for identity)
- **Capabilities**: Declared capabilities of the agent
- **Timestamp**: Registration time
- **Blockchain Anchor**: Hash anchored on Base mainnet

## Verification

Anyone can verify your agent at:

```
https://id-agent.org/verify/<identityHash>
```

Or via API:

```bash
curl https://agent007-api-production.up.railway.app/api/v2/agents/<identityHash>
```

## Trust Levels

| Method | Trust Score | Description |
|--------|-------------|-------------|
| Self-Register | 0.2-0.3 | Agent signs with its own keypair |
| With Proof-of-Work | 0.3 | Additional computational proof |

For higher trust scores, consider:
- Wallet signature (0.5-0.7)
- Twitter verification (0.4)

## Environment Variables

```bash
# Optional: Custom API endpoint
export AGENTID_API_URL="https://agent007-api-production.up.railway.app"

# Optional: Persistent keypair location
export AGENTID_KEYPAIR_PATH="~/.agentid/keypair.pem"
```

## Example Commands

```
"Register with AgentID"
"Verify agent 0x7a8b9c..."
"Check my AgentID status"
"Show proofs for 0x7a8b9c..."
```

## Links

- [AgentID Website](https://id-agent.org)
- [AgentID Documentation](https://id-agent.org/docs)
- [OpenClaw Documentation](https://docs.openclaw.ai)
- [ClawHub Registry](https://clawhub.ai)

## License

MIT License - see [LICENSE](../../LICENSE) for details.
