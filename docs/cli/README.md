# CLI Reference

The AgentID CLI (`agentidbase`) provides commands for registering, anchoring, and verifying AI agent identities.

## Installation

### Using npx (No Installation)

```bash
npx agentidbase <command>
```

### Global Installation

```bash
npm install -g agentidbase
```

Then use directly:

```bash
agentidbase <command>
```

## Command Overview

| Command | Description |
|---------|-------------|
| `init` | Create agent.json configuration file |
| `register` | Register an agent identity via API |
| `anchor` | Anchor an identity hash on-chain |
| `verify` | Verify an identity on-chain |
| `proof` | Generate verification proof/instructions |

## Quick Reference

```bash
# Create configuration
npx agentidbase init

# Register and anchor
npx agentidbase register --config agent.json

# Verify an identity
npx agentidbase verify 0x7a8b9c0d...

# Generate proof
npx agentidbase proof 0x7a8b9c0d...

# Anchor manually
npx agentidbase anchor 0x7a8b9c0d... --private-key $PRIVATE_KEY
```

## Global Options

These options work with all commands:

| Option | Description |
|--------|-------------|
| `-V, --version` | Output version number |
| `-h, --help` | Display help for command |

## Environment Variables

Configure default values:

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTID_API` | API endpoint | `https://api.agentid.xyz` |
| `AGENTID_CONTRACT` | Contract address | `0x471C4c43672be2d49A2ceC79203c23b7194A22Fa` |
| `AGENTID_RPC` | RPC endpoint | `https://mainnet.base.org` |
| `PRIVATE_KEY` | Wallet private key | - |

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Invalid arguments |
| 3 | Network error |
| 4 | Contract error |

## Examples

### Complete Workflow

```bash
# 1. Create configuration
npx agentidbase init
# Edit agent.json with your agent's details

# 2. Register and anchor
npx agentidbase register --config agent.json
# Save the identity hash from output

# 3. Verify anytime
npx agentidbase verify 0x<hash>
```

### Verification Only

```bash
# Verify without registering
npx agentidbase verify 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
```

### Custom Network

```bash
# Use testnet
npx agentidbase verify 0x... --rpc https://sepolia.base.org
```

## Detailed Command Documentation

See [Commands](commands.md) for detailed documentation of each command.

## Troubleshooting

### "Command not found"

Ensure Node.js 18+ is installed:

```bash
node --version
```

### "Permission denied"

On Linux/macOS, you might need:

```bash
sudo npm install -g agentidbase
```

Or use npx which doesn't require global installation.

### "Network error"

Check your internet connection and try a different RPC:

```bash
npx agentidbase verify 0x... --rpc https://rpc.ankr.com/base
```

## Getting Help

```bash
# General help
npx agentidbase --help

# Command-specific help
npx agentidbase register --help
npx agentidbase verify --help
```

## Next Steps

- [Detailed Commands](commands.md) - Complete command reference
- [First Agent Tutorial](../getting-started/first-agent.md) - Step-by-step guide
- [API Reference](../api/README.md) - REST API documentation
