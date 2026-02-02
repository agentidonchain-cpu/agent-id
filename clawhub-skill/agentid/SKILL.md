---
name: agentid
description: Register your agent identity on AgentID - the decentralized identity layer for AI agents on Base blockchain. Use this skill when the user asks to register, verify, or check identity status on AgentID.
license: MIT
compatibility: Requires curl and jq. Optional Ed25519 keypair for self-registration.
metadata:
  author: AgentID
  version: "1.0.0"
  tags: ["blockchain", "identity", "verification", "base", "web3", "ai-agents"]
  openclaw:
    requires:
      bins: ["curl", "jq"]
      env: []
    primaryEnv: "AGENTID_API_URL"
allowed-tools: Bash(curl:*) Bash(jq:*) Bash(openssl:*) Bash(base64:*) Read
---

# AgentID Skill

Register and verify your AI agent identity on AgentID - the decentralized identity layer for AI agents.

## What is AgentID?

AgentID provides cryptographic identity for AI agents, anchored on Base blockchain. It allows:
- **Proving agent configuration** hasn't changed
- **Verifying agent authenticity** via blockchain proofs
- **Building trust** between agents and users

Website: https://id-agent.org

## Available Commands

### 1. Register This Agent (Self-Registration)

When asked to register with AgentID, follow these steps:

**Step 1: Generate Ed25519 Keypair (if not exists)**

```bash
# Generate private key
openssl genpkey -algorithm ED25519 -out /tmp/agentid_private.pem 2>/dev/null

# Extract public key (base64)
AGENTID_PUBLIC_KEY=$(openssl pkey -in /tmp/agentid_private.pem -pubout -outform DER 2>/dev/null | tail -c 32 | base64)
echo "Public Key: $AGENTID_PUBLIC_KEY"
```

**Step 2: Create Registration Message**

```bash
AGENT_NAME="<agent name from config or conversation>"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Create the message to sign
MESSAGE="AgentID Self-Registration

Agent: $AGENT_NAME
Public Key: $AGENTID_PUBLIC_KEY
Timestamp: $TIMESTAMP"

echo "$MESSAGE"
```

**Step 3: Sign the Message**

```bash
# Sign with Ed25519
echo -n "$MESSAGE" | openssl pkeyutl -sign -inkey /tmp/agentid_private.pem 2>/dev/null | base64 -w0 > /tmp/agentid_signature.txt
SIGNATURE=$(cat /tmp/agentid_signature.txt)
```

**Step 4: Submit Registration**

```bash
API_URL="${AGENTID_API_URL:-https://agent007-api-production.up.railway.app}"

# Use the OpenClaw-specific endpoint for best integration
curl -s -X POST "$API_URL/api/v2/agents/openclaw" \
  -H "Content-Type: application/json" \
  -d "{
    \"source\": \"openclaw\",
    \"agent\": {
      \"name\": \"$AGENT_NAME\",
      \"model\": \"anthropic/claude-opus-4-5\",
      \"capabilities\": [\"conversation\", \"task-execution\"]
    },
    \"signature\": {
      \"type\": \"agent_keypair\",
      \"value\": \"$SIGNATURE\",
      \"publicKey\": \"$AGENTID_PUBLIC_KEY\",
      \"timestamp\": \"$TIMESTAMP\"
    }
  }" | jq '.'
```

**Step 5: Save Identity Hash**

After successful registration, save the returned `identityHash` for future reference.
The verification URL will be: `https://id-agent.org/verify/<identityHash>`

### 2. Verify an Agent Identity

To verify another agent's identity:

```bash
IDENTITY_HASH="<the 0x... hash to verify>"
API_URL="${AGENTID_API_URL:-https://agent007-api-production.up.railway.app}"

curl -s "$API_URL/api/v2/agents/$IDENTITY_HASH" | jq '{
  agentName: .data.agentName,
  identityType: .data.identityType,
  trustScore: .data.trustScore,
  trustDescription: .data.trustDescription,
  createdAt: .data.createdAt,
  anchor: .data.anchor
}'
```

### 3. Check Registration Status

To check if an identity hash is registered:

```bash
IDENTITY_HASH="<the 0x... hash>"
API_URL="${AGENTID_API_URL:-https://agent007-api-production.up.railway.app}"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/v2/agents/$IDENTITY_HASH")

if [ "$STATUS" = "200" ]; then
  echo "Agent is registered on AgentID"
  curl -s "$API_URL/api/v2/agents/$IDENTITY_HASH" | jq '.data.trustScore, .data.anchor'
else
  echo "Agent not found on AgentID"
fi
```

### 4. Get Proofs for an Agent

To see all verification proofs:

```bash
IDENTITY_HASH="<the 0x... hash>"
API_URL="${AGENTID_API_URL:-https://agent007-api-production.up.railway.app}"

curl -s "$API_URL/api/v2/agents/$IDENTITY_HASH/proofs" | jq '.data.proofs'
```

## Trust Scores

AgentID assigns trust scores based on verification level:

| Verification | Score | Description |
|--------------|-------|-------------|
| Wallet + Config | 0.7 | Human signed with full config stored |
| Wallet only | 0.5 | Human wallet signature |
| Twitter verified | 0.4 | Social proof via Twitter |
| Agent keypair | 0.3 | Self-registered with Ed25519 |
| No signature | 0.1 | Basic registration only |

## Environment Variables

Optional configuration:

```bash
# Custom API URL (defaults to production)
export AGENTID_API_URL="https://agent007-api-production.up.railway.app"

# Store your keypair path
export AGENTID_KEYPAIR_PATH="~/.agentid/keypair.pem"
```

## Example Conversation Flow

**User:** "Register yourself with AgentID"

**Agent Response:**
1. "I'll register with AgentID now..."
2. Generate/load Ed25519 keypair
3. Create and sign registration message
4. Submit to AgentID API
5. "Successfully registered! My identity hash is 0x7a8b9c..."
6. "You can verify me at: https://id-agent.org/verify/0x7a8b9c..."

## Error Handling

| Error | Solution |
|-------|----------|
| `curl: command not found` | Install curl: `apt install curl` |
| `jq: command not found` | Install jq: `apt install jq` |
| `openssl: command not found` | Install openssl: `apt install openssl` |
| `429 Too Many Requests` | Wait 1 hour (rate limit: 10/hour) |
| `409 Conflict` | Agent already registered with this key |

## Security Notes

- Private keys are generated in `/tmp/` and should be moved to a secure location
- Never share your private key
- The public key is safe to share and is used to verify your identity
- Identity hashes are deterministic - same config = same hash

## More Information

- Website: https://id-agent.org
- Documentation: https://id-agent.org/docs
- GitHub: https://github.com/anthropics/agentid
- Twitter: @agentidbase
