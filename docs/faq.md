# Frequently Asked Questions

## General

### What is AgentID?

AgentID is an open-source system that provides cryptographic identities for AI agents. It creates a unique hash from an agent's configuration (system prompt, model, parameters) and anchors it on the Base blockchain, enabling anyone to verify the agent's identity.

### Why do AI agents need identities?

When you interact with an AI agent, you have no way to verify:
- That its system prompt hasn't been modified
- That it's using the model it claims to use
- That its configuration matches what was originally declared
- That it's the same agent you trusted yesterday

AgentID solves this by creating cryptographic proof of an agent's configuration.

### Is AgentID a cryptocurrency or token?

**No.** AgentID is not a cryptocurrency, NFT, or financial instrument. It is:
- A registry of identity hashes
- A verification protocol
- An open-source tool

There are no tokens, no trading, no speculation.

### What blockchain does AgentID use?

AgentID uses **Base Mainnet** (Chain ID: 8453), an Ethereum Layer 2 developed by Coinbase. We chose Base because:
- Low transaction fees (<$0.01)
- Fast confirmations (~2 seconds)
- Ethereum security via L2
- Wide tooling support

### How much does it cost to use?

- **Verification**: Free (read-only blockchain queries)
- **Anchoring**: ~$0.001 in ETH gas fees per identity
- **API**: Free tier available, paid plans for high volume

---

## Technical

### How is the identity hash computed?

The hash is computed using SHA-256 on a Merkle tree of configuration components:

```
                 Identity Hash
                 (Merkle Root)
                      |
       +--------------+---------------+
       |              |               |
  Prompt Hash    Model Hash     Params Hash
```

Any change to any component produces a completely different hash.

### What's included in the hash?

| Included | Not Included |
|----------|--------------|
| System prompt | API keys (security) |
| Model provider | Agent name (metadata) |
| Model ID | Description (metadata) |
| Temperature | Avatar (metadata) |
| Max tokens | Creator info (stored separately) |
| Tools | |

### Can I verify without using AgentID?

**Yes!** Verification is completely independent. You can:
- Query the blockchain directly with any Ethereum client
- Use Foundry, ethers.js, viem, or curl
- No API keys or accounts needed

```bash
# Using Foundry
cast call 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa \
  "verifyIdentity(bytes32)" 0x<hash> \
  --rpc-url https://mainnet.base.org
```

### What happens if I change my agent's configuration?

The identity hash will change. This is by design:
1. Any modification produces a new hash
2. You must register a new identity
3. The old identity can optionally be revoked
4. Users see the hash changed = agent changed

### Can I update an identity?

No. Identities are immutable by design. If your configuration changes:
1. Compute the new hash
2. Anchor the new identity
3. Optionally revoke the old one
4. Update your application to use the new hash

### What if someone copies my configuration?

They would produce the same hash, but:
- Your anchor has an earlier timestamp (you registered first)
- Your wallet address is recorded as the original creator
- The on-chain history proves original ownership

### Can identities be deleted?

No. Once anchored, data is permanent. Identities can be **revoked**, which marks them as invalid while preserving the historical record.

---

## Security

### Is my system prompt stored on-chain?

**No.** Only the hash of your configuration is stored on-chain. The actual configuration (system prompt, etc.) remains private unless you choose to share it.

### Is my API key safe?

**Yes.** API keys are:
1. Never stored anywhere (not even hashed in identity)
2. Only used during validation (optional)
3. Never transmitted to AgentID servers

### What if someone discovers my configuration?

They can verify it matches your hash, but:
- Cannot modify the on-chain record
- Cannot claim they created it first
- Cannot revoke your identity (only you can)

### What if the contract has a bug?

The contract is:
- Audited (see security page)
- Open source and verified on BaseScan
- Minimal in scope (only stores hashes)
- Immutable (no admin upgrade functions)

### Can AgentID revoke my identity?

The contract owner can revoke identities, but this is only used for:
- Compliance with legal requirements
- Emergency security issues
- Never for commercial reasons

You (the creator) can always revoke your own identities.

---

## Integration

### How do I integrate AgentID into my agent?

1. Register your agent to get an identity hash
2. Include the hash in your agent's responses or metadata
3. Provide verification instructions to users

```javascript
// Example response
{
  "message": "Hello! How can I help?",
  "agentId": "0x7a8b9c0d...",
  "verify": "https://agentid.xyz/verify/0x7a8b9c0d..."
}
```

### Do I need to re-verify constantly?

No. Once verified, the identity is valid until revoked. You can:
- Cache verification results
- Re-verify periodically (hourly/daily)
- Verify on-demand when needed

### Can I use AgentID with any LLM provider?

Yes. AgentID is provider-agnostic and works with:
- Anthropic (Claude)
- OpenAI (GPT)
- Google (Gemini)
- Mistral
- Local/self-hosted models
- Any custom provider

### How do I handle agent versioning?

Each version has its own identity hash:

```
v1.0: 0x7a8b9c0d...  (active)
v1.1: 0x3f2e1d4c...  (active)
v1.0: 0x7a8b9c0d...  (revoked - after v2.0 release)
v2.0: 0x9e8f7a6b...  (active)
```

Track versions in your application and communicate changes to users.

---

## Troubleshooting

### "Identity not found"

The hash might not be anchored yet. Check:
1. Did registration complete successfully?
2. Was on-chain anchoring skipped (`--no-anchor`)?
3. Is the hash format correct (0x + 64 hex chars)?

### "Already anchored"

Someone registered the exact same configuration. This can happen with:
- Re-registering your own agent
- Very common configurations
- Duplicate registrations

### "Transaction failed"

Check:
1. You have ETH on Base for gas
2. The RPC endpoint is accessible
3. The hash format is valid

### "Hash doesn't match"

If you recompute the hash and get a different result:
1. Check whitespace in system prompt
2. Verify all parameters match exactly
3. Ensure tools are in the same order
4. Check encoding (UTF-8)

### "RPC connection error"

Try alternative RPC endpoints:
- `https://mainnet.base.org` (official)
- `https://rpc.ankr.com/base` (Ankr)
- `https://base.publicnode.com` (PublicNode)

---

## Business

### Is AgentID open source?

Yes. Everything is open source under MIT license:
- Smart contract (verified on BaseScan)
- CLI tool
- API server
- Documentation

### Can I run my own AgentID instance?

Yes. You can:
- Deploy your own contract
- Run your own API server
- Fork and modify the CLI

However, identities on your contract won't be recognized by the main network.

### Is there an enterprise plan?

Contact us for:
- Higher API rate limits
- Dedicated support
- Custom integrations
- SLAs

Email: enterprise@agentid.xyz

### How is AgentID funded?

AgentID is funded through:
- Grants
- Enterprise customers
- Community support

We have no tokens, no VC pressure, no incentive to rug.

---

## Privacy

### What data does AgentID collect?

**On-chain (public):**
- Identity hashes
- Creator wallet addresses
- Timestamps

**API (if used):**
- Agent metadata (name, description)
- Registration requests
- Standard server logs

**We never collect:**
- System prompts (only hashes)
- API keys
- User conversations
- Personal data

### Can I use AgentID anonymously?

Yes. You can:
- Use a fresh wallet for anchoring
- Skip the API and anchor directly
- Use Tor/VPN for CLI operations

### Is GDPR compliance needed?

The only personal data is wallet addresses. If you need GDPR compliance:
- Use a dedicated wallet
- Don't link it to your identity
- Contact us for data deletion requests

---

## Future

### Will there be breaking changes?

The on-chain data format is fixed and will never change. Future versions:
- Will use new contracts if needed
- Will provide migration tools
- Will maintain backward compatibility

### What features are planned?

See our roadmap:
- Multi-signature attestations
- Hardware wallet integration
- Enhanced autonomy detection
- Cross-chain verification
- SDK for more languages

### How can I contribute?

We welcome contributions:
- GitHub: https://github.com/agentid/agentid
- Discord: https://discord.gg/agentid
- Email: contribute@agentid.xyz

---

## Support

### Where can I get help?

- **Documentation**: https://docs.agentid.xyz
- **GitHub Issues**: Bug reports and feature requests
- **Discord**: Community support and discussion
- **Email**: support@agentid.xyz

### How do I report a security issue?

Email security@agentid.xyz with:
- Description of the issue
- Steps to reproduce
- Potential impact

Do NOT post security issues publicly. We have a bug bounty program.

### How do I contact the team?

- **General**: hello@agentid.xyz
- **Support**: support@agentid.xyz
- **Security**: security@agentid.xyz
- **Enterprise**: enterprise@agentid.xyz
- **Twitter**: @agentidbase
