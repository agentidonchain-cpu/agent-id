# Installation

AgentID provides a CLI tool that runs with `npx` (no installation required) or can be installed globally.

## Using npx (Recommended)

The simplest way to use AgentID is with `npx`:

```bash
npx agentidbase <command>
```

This always uses the latest version and requires no installation.

### Examples

```bash
# Create configuration
npx agentidbase init

# Register an agent
npx agentidbase register --config agent.json

# Verify an identity
npx agentidbase verify 0x1234567890abcdef...

# Generate verification proof
npx agentidbase proof 0x1234567890abcdef...
```

## Global Installation

If you prefer a permanent installation:

```bash
npm install -g agentidbase
```

Then use directly:

```bash
agentidbase init
agentidbase register --config agent.json
agentidbase verify 0x1234...
```

### Updating

To update to the latest version:

```bash
npm update -g agentidbase
```

### Uninstalling

```bash
npm uninstall -g agentidbase
```

## Project Installation

For use within a project:

```bash
npm install agentidbase
# or
yarn add agentidbase
# or
pnpm add agentidbase
```

Then use via npm scripts in `package.json`:

```json
{
  "scripts": {
    "agent:init": "agentidbase init",
    "agent:register": "agentidbase register --config agent.json",
    "agent:verify": "agentidbase verify"
  }
}
```

## System Requirements

| Requirement | Minimum | Recommended |
|-------------|---------|-------------|
| Node.js | 18.0.0 | 20.0.0+ |
| npm | 9.0.0 | 10.0.0+ |
| OS | Windows 10, macOS 10.15, Linux | Latest |

## Environment Variables

Configure defaults using environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `AGENTID_API` | API endpoint | `https://api.agentid.xyz` |
| `AGENTID_CONTRACT` | Contract address | `0x471C4c43672be2d49A2ceC79203c23b7194A22Fa` |
| `AGENTID_RPC` | Base RPC endpoint | `https://mainnet.base.org` |

### Setting Environment Variables

**Linux/macOS (bash/zsh):**

```bash
# Temporary (current session)
export AGENTID_RPC="https://your-custom-rpc.com"

# Permanent (add to ~/.bashrc or ~/.zshrc)
echo 'export AGENTID_RPC="https://your-custom-rpc.com"' >> ~/.bashrc
```

**Windows (PowerShell):**

```powershell
# Temporary (current session)
$env:AGENTID_RPC = "https://your-custom-rpc.com"

# Permanent
[Environment]::SetEnvironmentVariable("AGENTID_RPC", "https://your-custom-rpc.com", "User")
```

**Windows (Command Prompt):**

```cmd
set AGENTID_RPC=https://your-custom-rpc.com
```

## Verification Without AgentID CLI

You don't need the AgentID CLI to verify identities. Any Ethereum client works.

### Using Foundry (cast)

```bash
cast call 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa \
  "verifyIdentity(bytes32)" \
  0x<identity-hash> \
  --rpc-url https://mainnet.base.org
```

### Using curl

```bash
# First, encode the function call
# Function selector for verifyIdentity(bytes32): 0x2a8e0d28

curl -X POST https://mainnet.base.org \
  -H "Content-Type: application/json" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "eth_call",
    "params": [{
      "to": "0x471C4c43672be2d49A2ceC79203c23b7194A22Fa",
      "data": "0x2a8e0d28<32-byte-hash>"
    }, "latest"]
  }'
```

### Using ethers.js

```javascript
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('https://mainnet.base.org');
const contractAddress = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';
const abi = ['function verifyIdentity(bytes32) view returns (bool)'];

const contract = new ethers.Contract(contractAddress, abi, provider);
const isValid = await contract.verifyIdentity('0x<identity-hash>');
console.log('Identity valid:', isValid);
```

### Using viem

```typescript
import { createPublicClient, http } from 'viem';
import { base } from 'viem/chains';

const client = createPublicClient({
  chain: base,
  transport: http('https://mainnet.base.org'),
});

const isValid = await client.readContract({
  address: '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa',
  abi: [{
    name: 'verifyIdentity',
    type: 'function',
    inputs: [{ name: 'identityHash', type: 'bytes32' }],
    outputs: [{ type: 'bool' }],
    stateMutability: 'view',
  }],
  functionName: 'verifyIdentity',
  args: ['0x<identity-hash>'],
});
```

## Offline Usage

For air-gapped environments, you can:

1. **Hash Locally**: Compute identity hashes offline
2. **Export Transaction**: Generate unsigned transactions
3. **Sign Offline**: Sign with offline hardware wallet
4. **Broadcast**: Send signed transaction from online machine

The CLI supports this workflow:

```bash
# Generate unsigned transaction (offline)
npx agentidbase anchor 0x<hash> --unsigned --output tx.json

# Sign with hardware wallet (Ledger/Trezor)
# ... using your signing tool ...

# Broadcast signed transaction (online)
npx agentidbase broadcast --tx signed-tx.json
```

## Network Configuration

AgentID uses Base Mainnet by default. For testing, you can use:

| Network | Chain ID | RPC |
|---------|----------|-----|
| Base Mainnet | 8453 | `https://mainnet.base.org` |
| Base Sepolia | 84532 | `https://sepolia.base.org` |

```bash
# Use testnet
npx agentidbase verify 0x... --rpc https://sepolia.base.org
```

## Next Steps

- [Register Your First Agent](first-agent.md)
- [CLI Commands Reference](../cli/commands.md)
- [Understanding Identity Hashes](../concepts/identity-hash.md)
