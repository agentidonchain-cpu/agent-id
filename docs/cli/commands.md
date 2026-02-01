# CLI Commands

Complete reference for all AgentID CLI commands.

## init

Create an `agent.json` configuration file in the current directory.

### Usage

```bash
npx agentidbase init [options]
```

### Options

| Option | Description |
|--------|-------------|
| `-f, --force` | Overwrite existing agent.json |

### Examples

```bash
# Create agent.json (fails if exists)
npx agentidbase init

# Overwrite existing file
npx agentidbase init --force
```

### Output

Creates `agent.json`:

```json
{
  "name": "MyAgent",
  "description": "Describe what your agent does",
  "model": {
    "provider": "anthropic",
    "modelId": "claude-3-5-sonnet-20241022",
    "apiEndpoint": "https://api.anthropic.com/v1/messages"
  },
  "systemPrompt": "You are a helpful assistant...",
  "parameters": {
    "temperature": 0.7,
    "maxTokens": 4096
  }
}
```

### Configuration Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `name` | string | Yes | Human-readable agent name |
| `description` | string | Yes | What the agent does |
| `model.provider` | string | Yes | LLM provider |
| `model.modelId` | string | Yes | Model identifier |
| `model.apiEndpoint` | string | Yes | API URL |
| `systemPrompt` | string | Yes | System prompt |
| `parameters.temperature` | number | Yes | 0-2 |
| `parameters.maxTokens` | number | Yes | Max response tokens |

### Supported Providers

| Provider | Example Model IDs |
|----------|-------------------|
| `anthropic` | `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229` |
| `openai` | `gpt-4-turbo`, `gpt-4`, `gpt-3.5-turbo` |
| `google` | `gemini-pro`, `gemini-ultra` |
| `mistral` | `mistral-large`, `mistral-medium` |
| `custom` | Any model ID |

---

## register

Register a new agent identity with the AgentID API and optionally anchor on-chain.

### Usage

```bash
npx agentidbase register [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `-c, --config <path>` | Path to agent.json | `./agent.json` |
| `--api <url>` | API endpoint | `https://api.agentid.xyz` |
| `--no-anchor` | Skip blockchain anchoring | `false` |

### Examples

```bash
# Register with default config
npx agentidbase register

# Specify config file
npx agentidbase register --config ./my-agent.json

# Register without anchoring (API only)
npx agentidbase register --no-anchor

# Use custom API
npx agentidbase register --api https://custom-api.example.com
```

### Process

1. **Read Configuration**: Loads and validates agent.json
2. **Compute Hash**: Generates SHA-256 identity hash
3. **Submit to API**: Registers with AgentID API
4. **Anchor On-Chain**: (unless --no-anchor) Anchors hash on Base

### Output

```
AgentID - Register Agent

Reading configuration from ./agent.json...
Agent: MyAgent

Computing identity hash...
Identity Hash: 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b

Submitting to AgentID API...
Registration ID: abc123-def456-789012
Status: pending_anchor

Anchoring on-chain (Base Mainnet)...
Transaction: 0xabcdef1234567890...
Block: 12345678
Gas Used: 48,532

Success! Your agent identity is now anchored.

Identity Hash: 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b

Verify anytime:
  npx agentidbase verify 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b

View on BaseScan:
  https://basescan.org/tx/0xabcdef1234567890...
```

### Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Config file not found` | agent.json doesn't exist | Run `init` first |
| `Invalid configuration` | Missing or invalid fields | Check required fields |
| `Identity already exists` | Hash already anchored | Configuration unchanged |
| `API error` | Server issue | Try again later |

---

## anchor

Anchor an identity hash directly on-chain without using the API.

### Usage

```bash
npx agentidbase anchor <identityHash> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `identityHash` | The 32-byte hash to anchor (0x...) |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--rpc <url>` | RPC endpoint | `https://mainnet.base.org` |
| `--contract <address>` | Contract address | `0x471C4c43672be2d49A2ceC79203c23b7194A22Fa` |
| `--private-key <key>` | Wallet private key | `$PRIVATE_KEY` env |

### Examples

```bash
# Anchor with private key
npx agentidbase anchor 0x7a8b9c0d... --private-key 0x1234...

# Using environment variable
export PRIVATE_KEY=0x1234...
npx agentidbase anchor 0x7a8b9c0d...

# Custom RPC
npx agentidbase anchor 0x7a8b9c0d... --rpc https://custom-rpc.com
```

### Output

```
AgentID - Anchor Identity

Identity Hash: 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
Network: Base Mainnet (Chain ID: 8453)
Contract: 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa

Sending transaction...
Transaction Hash: 0xabcdef1234567890...

Waiting for confirmation...
Block: 12345678
Gas Used: 48,532
Status: Success

Identity anchored successfully!

Verify:
  npx agentidbase verify 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
```

### Security Notes

- **Never commit private keys to git**
- Use environment variables: `export PRIVATE_KEY=0x...`
- Consider hardware wallets for production

### Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Invalid hash format` | Hash not 32 bytes | Check format |
| `Already anchored` | Hash exists on-chain | Verify existing |
| `Insufficient funds` | No ETH for gas | Add ETH to wallet |
| `Transaction failed` | Contract error | Check parameters |

---

## verify

Verify an identity hash exists on-chain and is valid (not revoked).

### Usage

```bash
npx agentidbase verify <identityHash> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `identityHash` | The 32-byte hash to verify (0x...) |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--rpc <url>` | RPC endpoint | `https://mainnet.base.org` |
| `--contract <address>` | Contract address | `0x471C4c43672be2d49A2ceC79203c23b7194A22Fa` |

### Examples

```bash
# Verify identity
npx agentidbase verify 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b

# Use custom RPC
npx agentidbase verify 0x7a8b9c0d... --rpc https://rpc.ankr.com/base
```

### Output (Valid)

```
AgentID - Verify Identity

Identity Hash: 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
Network: Base Mainnet (Chain ID: 8453)

Querying on-chain status...

On-Chain Status:
  Anchored: Yes
  Creator: 0xAcmeCorp1234567890abcdef1234567890abcdef
  Anchored At: 2024-01-15 10:30:00 UTC
  Block: 12345678
  Revoked: No

+----------------------------------+
|       VERIFICATION: VALID        |
+----------------------------------+

This identity is anchored on-chain and has not been revoked.
```

### Output (Not Found)

```
AgentID - Verify Identity

Identity Hash: 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
Network: Base Mainnet (Chain ID: 8453)

Querying on-chain status...

On-Chain Status:
  Anchored: No

+----------------------------------+
|     VERIFICATION: NOT FOUND      |
+----------------------------------+

This identity hash is not anchored on-chain.
```

### Output (Revoked)

```
AgentID - Verify Identity

Identity Hash: 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
Network: Base Mainnet (Chain ID: 8453)

Querying on-chain status...

On-Chain Status:
  Anchored: Yes
  Creator: 0xAcmeCorp1234567890abcdef1234567890abcdef
  Anchored At: 2024-01-15 10:30:00 UTC
  Revoked: Yes
  Revoked At: 2024-02-01 14:00:00 UTC

+----------------------------------+
|      VERIFICATION: REVOKED       |
+----------------------------------+

This identity was revoked and is no longer valid.
```

### Exit Codes

| Code | Status |
|------|--------|
| 0 | Valid |
| 1 | Not found or revoked |
| 3 | Network error |

---

## proof

Generate verification instructions that others can use to independently verify an identity.

### Usage

```bash
npx agentidbase proof <identityHash> [options]
```

### Arguments

| Argument | Description |
|----------|-------------|
| `identityHash` | The 32-byte hash (0x...) |

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--rpc <url>` | RPC endpoint to include | `https://mainnet.base.org` |
| `--contract <address>` | Contract address | `0x471C4c43672be2d49A2ceC79203c23b7194A22Fa` |

### Examples

```bash
# Generate proof
npx agentidbase proof 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
```

### Output

```
AgentID - Verification Proof

Identity Hash: 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b

Contract Information:
  Address: 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa
  Network: Base Mainnet (Chain ID: 8453)
  Explorer: https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa

=== Verification Methods ===

1. Using Foundry (cast):
   cast call 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa \
     "verifyIdentity(bytes32)(bool)" \
     0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b \
     --rpc-url https://mainnet.base.org

2. Using curl (JSON-RPC):
   curl -X POST https://mainnet.base.org \
     -H "Content-Type: application/json" \
     -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0x471C4c43672be2d49A2ceC79203c23b7194A22Fa","data":"0x2a8e0d287a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b"},"latest"]}'

3. Using ethers.js:
   const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
   const contract = new ethers.Contract(
     '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa',
     ['function verifyIdentity(bytes32) view returns (bool)'],
     provider
   );
   const valid = await contract.verifyIdentity('0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b');

4. Using BaseScan (Browser):
   https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa#readContract
   - Click "verifyIdentity"
   - Enter: 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
   - Click "Query"

Response Interpretation:
  - true  (0x...001) = Identity is valid
  - false (0x...000) = Identity not found or revoked
```

### Use Cases

- Share with auditors for independent verification
- Include in documentation
- Provide to users for trust verification
- Compliance reporting

---

## Common Patterns

### CI/CD Integration

```yaml
# .github/workflows/verify-agent.yml
name: Verify Agent Identity
on: [push]
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - name: Verify Identity
        run: npx agentidbase verify ${{ secrets.AGENT_HASH }}
```

### Scripting

```bash
#!/bin/bash
# verify-all-agents.sh

AGENTS=(
  "0x7a8b9c0d..."
  "0x3f2e1d4c..."
  "0x9e8f7a6b..."
)

for hash in "${AGENTS[@]}"; do
  echo "Verifying $hash..."
  if npx agentidbase verify "$hash" > /dev/null 2>&1; then
    echo "  VALID"
  else
    echo "  INVALID"
  fi
done
```

### JSON Output (Programmatic)

```bash
# Capture verification result
RESULT=$(npx agentidbase verify 0x7a8b9c0d... 2>&1)
if echo "$RESULT" | grep -q "VALID"; then
  echo "Agent is valid"
fi
```

## Next Steps

- [API Reference](../api/README.md) - REST API documentation
- [Smart Contract](../smart-contract/README.md) - Contract details
- [First Agent Tutorial](../getting-started/first-agent.md)
