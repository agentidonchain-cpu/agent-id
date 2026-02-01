# Getting Started

This guide will walk you through setting up AgentID and registering your first agent identity.

## Prerequisites

Before you begin, ensure you have:

- **Node.js 18+** installed ([download](https://nodejs.org))
- **npm** or **yarn** package manager
- A terminal/command prompt

For on-chain anchoring, you'll also need:
- A small amount of ETH on Base Mainnet (for gas fees)
- A wallet with a private key

## Overview

The typical workflow for AgentID is:

```
1. INIT           2. CONFIGURE        3. REGISTER         4. VERIFY
   |                  |                   |                   |
   v                  v                   v                   v
+--------+      +------------+      +------------+      +----------+
| Create |  ->  | Edit JSON  |  ->  | Submit to  |  ->  | Query    |
| Config |      | Add prompt |      | API/Chain  |      | On-Chain |
+--------+      +------------+      +------------+      +----------+
```

## Quick Start (5 Minutes)

### Step 1: Create Configuration

```bash
npx agentidbase init
```

This creates `agent.json` with a template configuration.

### Step 2: Edit Configuration

Open `agent.json` and configure your agent:

```json
{
  "name": "MyAgent",
  "description": "A helpful AI assistant",
  "model": {
    "provider": "anthropic",
    "modelId": "claude-3-5-sonnet-20241022",
    "apiEndpoint": "https://api.anthropic.com/v1/messages"
  },
  "systemPrompt": "You are a helpful assistant that...",
  "parameters": {
    "temperature": 0.7,
    "maxTokens": 4096
  }
}
```

### Step 3: Register Agent

```bash
npx agentidbase register --config agent.json
```

The CLI will:
1. Compute the identity hash
2. Submit to the AgentID API
3. Anchor the hash on-chain (Base Mainnet)

### Step 4: Verify Identity

```bash
npx agentidbase verify 0x<your-identity-hash>
```

You'll see:
- Whether the identity is anchored
- When it was anchored
- Who anchored it

## What's Next?

- [Installation Details](installation.md) - Complete installation guide
- [Register First Agent](first-agent.md) - Detailed registration walkthrough
- [Core Concepts](../concepts/README.md) - Understand how AgentID works

## Example Agents

Here are some example agent configurations:

### Customer Support Agent

```json
{
  "name": "SupportBot",
  "description": "Customer support assistant",
  "model": {
    "provider": "openai",
    "modelId": "gpt-4-turbo",
    "apiEndpoint": "https://api.openai.com/v1/chat/completions"
  },
  "systemPrompt": "You are a customer support agent for Acme Corp. You help users with product questions, troubleshooting, and account issues. Always be polite and helpful. Never share confidential information.",
  "parameters": {
    "temperature": 0.3,
    "maxTokens": 2048
  }
}
```

### Code Review Agent

```json
{
  "name": "CodeReviewer",
  "description": "Automated code review assistant",
  "model": {
    "provider": "anthropic",
    "modelId": "claude-3-5-sonnet-20241022",
    "apiEndpoint": "https://api.anthropic.com/v1/messages"
  },
  "systemPrompt": "You are an expert code reviewer. Analyze code for bugs, security issues, performance problems, and style violations. Provide constructive feedback with specific suggestions.",
  "parameters": {
    "temperature": 0.2,
    "maxTokens": 8192
  }
}
```

## Troubleshooting

### "npx: command not found"

Ensure Node.js is installed correctly:

```bash
node --version  # Should show v18.x.x or higher
npm --version   # Should show 9.x.x or higher
```

### "Insufficient funds for gas"

On-chain anchoring requires a small amount of ETH on Base. You need approximately 0.0001-0.001 ETH for gas.

### "Network error"

Check your internet connection and try again. If using a custom RPC:

```bash
npx agentidbase verify 0x... --rpc https://your-rpc-endpoint.com
```

## Support

Need help? Check out:

- [FAQ](../faq.md) - Common questions
- [GitHub Issues](https://github.com/agentid/agentid/issues) - Bug reports
- [Discord](https://discord.gg/agentid) - Community support
