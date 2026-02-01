# Register Your First Agent

This guide walks you through registering your first AI agent identity with AgentID.

## Overview

Registering an agent creates an immutable identity that can be verified by anyone. The process is:

```
+----------------+     +---------------+     +----------------+
| 1. Configure   | --> | 2. Register   | --> | 3. Anchor      |
|    agent.json  |     |    via API    |     |    on-chain    |
+----------------+     +---------------+     +----------------+
                                                     |
                                                     v
                                              +--------------+
                                              | 4. Share     |
                                              |    hash      |
                                              +--------------+
```

## Step 1: Create Configuration File

Start by creating the configuration file:

```bash
npx agentidbase init
```

This creates `agent.json`:

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

| Field | Required | Description |
|-------|----------|-------------|
| `name` | Yes | Human-readable name for your agent |
| `description` | Yes | What your agent does |
| `model.provider` | Yes | LLM provider (anthropic, openai, etc.) |
| `model.modelId` | Yes | Specific model identifier |
| `model.apiEndpoint` | Yes | API endpoint URL |
| `systemPrompt` | Yes | The system prompt that defines behavior |
| `parameters.temperature` | Yes | Sampling temperature (0-2) |
| `parameters.maxTokens` | Yes | Maximum response tokens |

### Supported Providers

| Provider | Valid Model IDs |
|----------|----------------|
| `anthropic` | `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`, `claude-3-haiku-20240307` |
| `openai` | `gpt-4-turbo`, `gpt-4`, `gpt-3.5-turbo` |
| `google` | `gemini-pro`, `gemini-ultra` |
| `mistral` | `mistral-large`, `mistral-medium`, `mistral-small` |
| `custom` | Any model ID for self-hosted models |

## Step 2: Write Your System Prompt

The system prompt is the most important part of your agent's identity. It should clearly define:

- **Role**: What the agent is
- **Capabilities**: What it can do
- **Constraints**: What it should NOT do
- **Behavior**: How it should respond

### Example: Technical Support Agent

```
You are TechBot, a technical support specialist for CloudSync software.

## Your Role
- Help users troubleshoot CloudSync installation and configuration issues
- Guide users through common workflows
- Escalate complex issues to human support when needed

## Capabilities
- Explain technical concepts in simple terms
- Provide step-by-step instructions
- Reference official documentation
- Suggest diagnostic commands

## Constraints
- Never access or modify user files
- Never share API keys or credentials
- Never make promises about features or timelines
- Always recommend contacting support for billing issues

## Behavior Guidelines
- Be patient and understanding
- Ask clarifying questions when needed
- Provide one solution at a time
- Confirm the issue is resolved before ending
```

### Tips for System Prompts

1. **Be Specific**: Vague prompts lead to inconsistent behavior
2. **Include Constraints**: What the agent should NOT do
3. **Define Scope**: Clear boundaries prevent unexpected behavior
4. **Test Thoroughly**: Run your agent through various scenarios

## Step 3: Register the Agent

Once your configuration is ready:

```bash
npx agentidbase register --config agent.json
```

### What Happens

1. **Hash Computation**: The CLI computes a SHA-256 hash of your configuration
2. **API Registration**: The configuration is submitted to the AgentID API
3. **Validation**: The API validates the configuration format
4. **On-Chain Anchoring**: The hash is anchored on Base Mainnet

### Output

```
AgentID - Register Agent

Computing identity hash...
Identity Hash: 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b

Submitting to AgentID API...
Registration ID: abc123-def456

Anchoring on-chain (Base Mainnet)...
Transaction: 0x1234567890abcdef...
Block: 12345678

Success! Your agent identity is now anchored.

Share your identity hash:
0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b

Verify anytime:
npx agentidbase verify 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b
```

### Registration Options

| Option | Description |
|--------|-------------|
| `-c, --config <path>` | Path to agent.json (default: ./agent.json) |
| `--api <url>` | API endpoint (default: https://api.agentid.xyz) |
| `--no-anchor` | Skip blockchain anchoring (API only) |

## Step 4: Verify Your Agent

After registration, verify the identity was anchored:

```bash
npx agentidbase verify 0x<your-identity-hash>
```

### Output

```
AgentID - Verify Identity

Identity Hash: 0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b

On-Chain Status:
  Anchored: Yes
  Creator: 0xYourWalletAddress...
  Anchored At: 2024-01-15 10:30:00 UTC
  Revoked: No

Verification: VALID
```

## Step 5: Share Your Identity

Share your identity hash so others can verify your agent:

### In Your Application

```javascript
// Add to your agent's responses
const metadata = {
  agentId: '0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
  verifyUrl: 'https://agentid.xyz/verify/0x7a8b...'
};
```

### In Documentation

```markdown
## Verification

This agent's identity is registered with AgentID.

**Identity Hash:** `0x7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b`

Verify on-chain:
\`\`\`bash
npx agentidbase verify 0x7a8b9c0d...
\`\`\`
```

### Badge/Widget

```html
<a href="https://agentid.xyz/verify/0x7a8b...">
  <img src="https://agentid.xyz/badge/0x7a8b..." alt="AgentID Verified" />
</a>
```

## What's Next?

Your agent is now registered! Here's what you can do:

1. **Monitor**: Track verification attempts via the API
2. **Update**: If you change your agent, register a new identity
3. **Revoke**: If needed, revoke the identity on-chain

## Updating Your Agent

If you modify your agent's configuration:

1. The identity hash will change
2. You need to register a new identity
3. The old identity remains valid (unless revoked)

This is by design - it ensures any configuration change is visible.

## Common Issues

### "Invalid configuration"

Check that all required fields are present and valid:

```bash
# Validate without registering
npx agentidbase validate --config agent.json
```

### "Identity already exists"

Someone has already registered an agent with this exact configuration. This is expected for:
- Re-registering the same agent
- Common configurations

### "Transaction failed"

For on-chain anchoring issues:
- Ensure you have ETH on Base for gas
- Check the RPC endpoint is accessible
- Try increasing gas price

## Advanced: Manual Anchoring

If you want to anchor separately:

```bash
# Register without anchoring
npx agentidbase register --config agent.json --no-anchor

# Anchor later with your own wallet
npx agentidbase anchor 0x<hash> --private-key <key>
```

## Next Steps

- [Understanding Identity Hashes](../concepts/identity-hash.md)
- [CLI Commands Reference](../cli/commands.md)
- [API Endpoints](../api/endpoints.md)
