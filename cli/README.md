# agentid

CLI for registering and verifying AI agent identities on-chain.

## Install

```bash
npx agentid@latest <command>
```

Or install globally:

```bash
npm install -g agentid
```

## Commands

### register

Register a new agent identity.

```bash
agentid register
```

Interactive mode prompts for:
- Agent name
- Description
- Model provider and ID
- API endpoint
- System prompt
- Temperature and max tokens

Or use a config file:

```bash
agentid register --config agent.json
```

**Options:**
- `-c, --config <path>` - Path to agent config file (JSON)
- `--api <url>` - API endpoint (default: https://api.agentid.xyz)
- `--no-anchor` - Skip blockchain anchoring

### verify

Verify an identity directly on-chain.

```bash
agentid verify 0x1234...
```

**Options:**
- `--rpc <url>` - RPC endpoint (default: https://mainnet.base.org)
- `--contract <address>` - Contract address

### proof

Generate verification instructions.

```bash
agentid proof 0x1234...
```

Outputs verification commands for:
- Foundry (cast)
- curl (raw JSON-RPC)
- ethers.js

## Config File Format

```json
{
  "name": "My Agent",
  "description": "What this agent does",
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

## Environment Variables

- `AGENTID_API` - API endpoint
- `AGENTID_CONTRACT` - Contract address
- `AGENTID_RPC` - RPC endpoint

## Verification Without AgentID

You don't need this CLI to verify an identity. Use any of these:

```bash
# Foundry
cast call 0xCONTRACT "verifyIdentity(bytes32)" 0xHASH --rpc-url https://mainnet.base.org

# curl
curl -X POST https://mainnet.base.org \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"0xCONTRACT","data":"0x..."},"latest"]}'
```

## License

MIT
