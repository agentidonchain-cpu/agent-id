# AgentID - Landing Page Content

## Hero Section

**Headline:**
Cryptographic identity for AI agents

**Subline:**
Anchor your agent's configuration on-chain. Verify without trusting anyone.

---

## Section: Register via Terminal

**Title:**
Register your agent via terminal

**Code block:**
```bash
npx agentid@latest register
```

**Copy:**
This command generates a cryptographic identity for your agent and anchors it on-chain.
No platform lock-in. Verification works without AgentID servers.

---

## Section: How it works

**Title:**
Minimal trust infrastructure

**Steps:**

1. **Hash**
   Your agent's configuration (model, system prompt, parameters) is hashed into a unique 256-bit fingerprint.

2. **Anchor**
   The hash is recorded on Base blockchain. Timestamp proves existence.

3. **Verify**
   Anyone can verify the hash directly on-chain. No API required.

---

## Section: Verify without trusting us

**Title:**
Verify without trusting us

**Code block:**
```bash
cast call 0xCONTRACT \
  "verifyIdentity(bytes32)" 0xHASH \
  --rpc-url https://mainnet.base.org
```

**Copy:**
AgentID acts as a notary. The blockchain is the source of truth.

You can verify any agent identity using:
- Foundry (`cast`)
- Any Ethereum library (ethers.js, web3.js, viem)
- Direct JSON-RPC calls
- Block explorer read functions

---

## Section: What gets hashed

**Title:**
What defines an agent's identity

**List:**
- System prompt (full content)
- Model provider and ID
- API endpoint
- Generation parameters (temperature, max tokens, etc.)
- Tool definitions (if any)

**Note:**
The identity hash changes if any of these change. This is intentional.

---

## Section: What AgentID is NOT

**Title:**
What AgentID is not

**List:**
- Not a runtime monitor
- Not a behavior guarantee
- Not an AI safety solution
- Not a replacement for audits

**Copy:**
AgentID proves configuration existence at a point in time.
It does not prove behavior, capability, or intent.

---

## Section: Live Counter

**Endpoint:**
```
GET https://api.agentid.xyz/blockchain/stats
```

**Display:**
```
{totalAgents} agents registered
```

**Update:** Real-time via polling or WebSocket

---

## Section: Technical Details

**Title:**
Technical details

**Table:**

| Property | Value |
|----------|-------|
| Hash algorithm | SHA-256 |
| Chain | Base Mainnet |
| Chain ID | 8453 |
| Contract | 0x... |
| Block explorer | basescan.org |

---

## Footer

**Links:**
- Documentation
- GitHub
- Contract on Basescan
- API Reference

**Legal:**
AgentID is infrastructure, not a guarantee.
The blockchain is the source of truth, not this website.

---

## Design Notes

**Tone:**
- Technical, not marketing
- Honest about limitations
- No buzzwords
- No emojis

**Typography:**
- Monospace for code and hashes
- Clear hierarchy
- High contrast

**Colors:**
- Minimal palette
- Terminal aesthetic acceptable
- Avoid "crypto bro" vibes

**Must avoid:**
- "Revolutionary"
- "AI-powered"
- "Autonomous"
- "Intelligent"
- "Secure" (without qualification)
- Any claim about agent behavior
