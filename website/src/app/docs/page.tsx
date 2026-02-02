"use client";

import Link from "next/link";

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e5e5e5]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-[#262626] bg-[#0a0a0a]/90 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-lg font-semibold tracking-tight hover:text-[#22c55e] transition-colors">
            AgentID
          </Link>
          <nav className="flex items-center gap-6 text-sm text-[#737373]">
            <Link href="/agents" className="hover:text-[#e5e5e5] transition-colors">Agents</Link>
            <a href="https://github.com/agentidonchain-cpu/agent-id" target="_blank" rel="noopener noreferrer" className="hover:text-[#e5e5e5] transition-colors">GitHub</a>
          </nav>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 pt-28 pb-20">
        {/* Hero */}
        <div className="mb-12">
          <h1 className="text-4xl font-bold mb-4">Documentation</h1>
          <p className="text-xl text-[#737373]">
            Cryptographic identity verification for AI agents on Base blockchain
          </p>
        </div>

        {/* Quick Start */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-[#22c55e]">Quick Start</h2>

          <div className="bg-gradient-to-r from-[#22c55e]/10 to-transparent border border-[#22c55e]/30 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🚀</span>
              <h3 className="text-lg font-medium">Fastest way to register (60 seconds)</h3>
            </div>
            <div className="bg-[#0a0a0a] rounded-lg p-4 mb-3">
              <pre className="text-sm overflow-x-auto">
                <code className="text-[#22c55e]">npx agentidbase attest</code>
              </pre>
            </div>
            <p className="text-sm text-[#737373]">
              Interactive wizard guides you through. No config file needed. Free on-chain anchoring included.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <div className="text-2xl mb-2 text-[#22c55e]">1</div>
              <h4 className="font-medium mb-2">Register your agent</h4>
              <p className="text-sm text-[#737373]">
                Run <code className="text-[#22c55e]">attest</code> and follow the prompts. Sign with MetaMask.
              </p>
            </div>
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <div className="text-2xl mb-2 text-[#22c55e]">2</div>
              <h4 className="font-medium mb-2">Link Twitter (optional)</h4>
              <p className="text-sm text-[#737373]">
                Run <code className="text-[#22c55e]">verify-twitter</code> to add social proof.
              </p>
            </div>
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <div className="text-2xl mb-2 text-[#22c55e]">3</div>
              <h4 className="font-medium mb-2">Share your verification</h4>
              <p className="text-sm text-[#737373]">
                Use <code className="text-[#22c55e]">qr</code> to generate a QR code anyone can scan.
              </p>
            </div>
          </div>
        </section>

        {/* Identity Types */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-[#22c55e]">Identity Types</h2>

          <div className="space-y-6">
            {/* Attestation */}
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 bg-yellow-500/20 text-yellow-400 border border-yellow-500/30 rounded text-sm font-medium">
                  ATTESTATION
                </span>
                <span className="text-xs text-[#737373]">Default - lowest friction</span>
              </div>
              <h3 className="text-lg font-medium mb-2">For closed platform agents</h3>
              <p className="text-[#737373] mb-4">
                Use when you operate an agent on ChatGPT, Character.AI, Poe, or other platforms
                where you can&apos;t access the configuration.
              </p>
              <div className="bg-[#0a0a0a] rounded-lg p-4 mb-4">
                <pre className="text-sm overflow-x-auto">
                  <code className="text-[#22c55e]">npx agentidbase attest</code>
                </pre>
              </div>
              <div className="text-sm text-[#737373]">
                <strong>What it proves:</strong> Someone claims to operate this agent<br/>
                <strong>What it does NOT prove:</strong> Agent&apos;s actual behavior or configuration
              </div>
            </div>

            {/* Fingerprint */}
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 rounded text-sm font-medium">
                  FINGERPRINT
                </span>
                <span className="text-xs text-[#737373]">Verifiable configuration</span>
              </div>
              <h3 className="text-lg font-medium mb-2">For open source / self-hosted agents</h3>
              <p className="text-[#737373] mb-4">
                Creates a cryptographic hash of your agent&apos;s configuration that anyone can verify
                by comparing against the source.
              </p>
              <div className="bg-[#0a0a0a] rounded-lg p-4 mb-4">
                <pre className="text-sm overflow-x-auto">
                  <code className="text-[#22c55e]">{`# First create agent.json
npx agentidbase init

# Then register fingerprint
npx agentidbase define`}</code>
                </pre>
              </div>
              <div className="text-sm text-[#737373]">
                <strong>What it proves:</strong> Agent has this specific configuration<br/>
                <strong>What it does NOT prove:</strong> Agent actually uses this config at runtime
              </div>
            </div>

            {/* Self-Claim */}
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-6">
              <div className="flex items-center gap-3 mb-4">
                <span className="px-3 py-1 bg-purple-500/20 text-purple-400 border border-purple-500/30 rounded text-sm font-medium">
                  SELF-CLAIM
                </span>
                <span className="text-xs text-[#737373]">Autonomous agents</span>
              </div>
              <h3 className="text-lg font-medium mb-2">For autonomous agents</h3>
              <p className="text-[#737373] mb-4">
                Agent registers itself with its own Ed25519 keypair. No human wallet required.
                Perfect for agent-to-agent trust networks.
              </p>
              <div className="bg-[#0a0a0a] rounded-lg p-4 mb-4">
                <pre className="text-sm overflow-x-auto">
                  <code className="text-[#22c55e]">npx agentidbase self</code>
                </pre>
              </div>
              <div className="text-sm text-[#737373]">
                <strong>What it proves:</strong> An agent with this keypair exists<br/>
                <strong>What it does NOT prove:</strong> Who controls the agent
              </div>
            </div>
          </div>
        </section>

        {/* Twitter Verification */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-[#22c55e]">Twitter Verification</h2>

          <div className="bg-[#171717] border border-[#262626] rounded-lg p-6">
            <p className="text-[#737373] mb-4">
              Link your Twitter account to your agent identity for additional social proof.
              This is optional but increases trust.
            </p>

            <div className="bg-[#0a0a0a] rounded-lg p-4 mb-4">
              <pre className="text-sm overflow-x-auto">
                <code className="text-[#22c55e]">{`# After registering your agent
npx agentidbase verify-twitter @yourhandle`}</code>
              </pre>
            </div>

            <div className="space-y-3 text-sm">
              <div className="flex items-start gap-3">
                <span className="text-[#22c55e] font-bold">1.</span>
                <span className="text-[#737373]">CLI generates a unique verification code</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-[#22c55e] font-bold">2.</span>
                <span className="text-[#737373]">You post a tweet containing the code</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-[#22c55e] font-bold">3.</span>
                <span className="text-[#737373]">Paste the tweet URL back in the CLI</span>
              </div>
              <div className="flex items-start gap-3">
                <span className="text-[#22c55e] font-bold">4.</span>
                <span className="text-[#737373]">Your Twitter is now linked to your agent!</span>
              </div>
            </div>

            <div className="mt-4 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded text-sm text-yellow-400">
              <strong>Note:</strong> This proves you controlled the Twitter account at verification time.
              The proof tweet may be deleted later.
            </div>
          </div>
        </section>

        {/* Trust Score */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-[#22c55e]">Trust Score</h2>

          <div className="bg-[#171717] border border-[#262626] rounded-lg p-6 mb-6">
            <p className="text-[#737373] mb-4">
              Every agent identity has a trust score from 0 to 1.0 that indicates how much verification
              has been done. Higher scores mean more verifications.
            </p>

            <h4 className="font-medium mb-3">How Trust Score is Calculated</h4>

            <div className="space-y-3 mb-6">
              <div className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded">
                <span className="text-[#737373]">Base attestation (no signature)</span>
                <span className="font-mono text-yellow-400">0.1</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded">
                <span className="text-[#737373]">Self-claim (agent keypair)</span>
                <span className="font-mono text-yellow-400">0.2 - 0.3</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded">
                <span className="text-[#737373]">Fingerprint (config hash)</span>
                <span className="font-mono text-cyan-400">0.3 - 0.7</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded">
                <span className="text-[#737373]">Human wallet signature</span>
                <span className="font-mono text-green-400">0.5 - 0.6</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded">
                <span className="text-[#737373]">Twitter verification</span>
                <span className="font-mono text-blue-400">+0.1 bonus</span>
              </div>
              <div className="flex items-center justify-between p-3 bg-[#0a0a0a] rounded">
                <span className="text-[#737373]">System prompt hash included</span>
                <span className="font-mono text-purple-400">+0.1 bonus</span>
              </div>
            </div>

            <h4 className="font-medium mb-3">Trust Level Descriptions</h4>
            <div className="space-y-2 text-sm">
              <div className="flex gap-3">
                <span className="w-20 text-red-400 font-medium">0.0 - 0.2</span>
                <span className="text-[#737373]">Unverified - minimal trust, no proof of control</span>
              </div>
              <div className="flex gap-3">
                <span className="w-20 text-yellow-400 font-medium">0.2 - 0.4</span>
                <span className="text-[#737373]">Basic - some verification, use with caution</span>
              </div>
              <div className="flex gap-3">
                <span className="w-20 text-cyan-400 font-medium">0.4 - 0.6</span>
                <span className="text-[#737373]">Moderate - wallet or Twitter verified</span>
              </div>
              <div className="flex gap-3">
                <span className="w-20 text-green-400 font-medium">0.6 - 0.8</span>
                <span className="text-[#737373]">Good - multiple verifications, config auditable</span>
              </div>
              <div className="flex gap-3">
                <span className="w-20 text-[#22c55e] font-medium">0.8 - 1.0</span>
                <span className="text-[#737373]">High - fully verified with multiple proofs</span>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-500/10 border border-blue-500/20 rounded-lg text-sm">
            <strong className="text-blue-400">Tip:</strong>
            <span className="text-[#737373]"> To maximize your trust score, use a wallet signature, link Twitter, and include your agent&apos;s system prompt hash.</span>
          </div>
        </section>

        {/* CLI Commands */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-[#22c55e]">CLI Commands</h2>

          <div className="bg-[#171717] border border-[#262626] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#262626]">
                <tr>
                  <th className="text-left p-4 font-medium">Command</th>
                  <th className="text-left p-4 font-medium">Description</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#262626]">
                <tr>
                  <td className="p-4 font-mono text-[#22c55e]">npx agentidbase init</td>
                  <td className="p-4 text-[#737373]">Create agent.json configuration file</td>
                </tr>
                <tr>
                  <td className="p-4 font-mono text-[#22c55e]">npx agentidbase attest</td>
                  <td className="p-4 text-[#737373]">Declare ownership of a closed platform agent</td>
                </tr>
                <tr>
                  <td className="p-4 font-mono text-[#22c55e]">npx agentidbase define</td>
                  <td className="p-4 text-[#737373]">Create fingerprint from agent configuration</td>
                </tr>
                <tr>
                  <td className="p-4 font-mono text-[#22c55e]">npx agentidbase self</td>
                  <td className="p-4 text-[#737373]">Agent self-registers with Ed25519 keypair</td>
                </tr>
                <tr>
                  <td className="p-4 font-mono text-[#22c55e]">npx agentidbase verify &lt;hash&gt;</td>
                  <td className="p-4 text-[#737373]">Verify an agent identity on-chain</td>
                </tr>
                <tr>
                  <td className="p-4 font-mono text-[#22c55e]">npx agentidbase verify-twitter</td>
                  <td className="p-4 text-[#737373]">Link Twitter account to your agent</td>
                </tr>
                <tr>
                  <td className="p-4 font-mono text-[#22c55e]">npx agentidbase qr &lt;hash&gt;</td>
                  <td className="p-4 text-[#737373]">Generate QR code for verification</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* API */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-[#22c55e]">API Reference</h2>

          <div className="bg-[#171717] border border-[#262626] rounded-lg p-6 mb-6">
            <h3 className="text-lg font-medium mb-2">Base URL</h3>
            <pre className="bg-[#0a0a0a] rounded-lg p-4 text-sm">
              <code className="text-[#737373]">https://agent007-api-production.up.railway.app/api/v2</code>
            </pre>
          </div>

          <div className="space-y-4">
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-medium">POST</span>
                <code className="text-sm">/agents/attest</code>
              </div>
              <p className="text-sm text-[#737373]">Create attestation for closed platform agent</p>
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-medium">POST</span>
                <code className="text-sm">/agents/fingerprint</code>
              </div>
              <p className="text-sm text-[#737373]">Create fingerprint from agent config</p>
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-medium">POST</span>
                <code className="text-sm">/agents/self-register</code>
              </div>
              <p className="text-sm text-[#737373]">Agent self-registers with Ed25519</p>
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">GET</span>
                <code className="text-sm">/agents/:hash</code>
              </div>
              <p className="text-sm text-[#737373]">Get agent identity details</p>
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">GET</span>
                <code className="text-sm">/agents/:hash/proofs</code>
              </div>
              <p className="text-sm text-[#737373]">Get all proofs for an identity</p>
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">GET</span>
                <code className="text-sm">/agents</code>
              </div>
              <p className="text-sm text-[#737373]">List all registered agents</p>
            </div>
          </div>
        </section>

        {/* Contract */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-[#22c55e]">Smart Contract</h2>

          <div className="bg-[#171717] border border-[#262626] rounded-lg p-6">
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="text-sm text-[#737373] mb-1">Chain</h4>
                <p className="font-medium">Base Mainnet (8453)</p>
              </div>
              <div>
                <h4 className="text-sm text-[#737373] mb-1">Contract Address</h4>
                <a
                  href="https://basescan.org/address/0x471C4c43672be2d49A2ceC79203c23b7194A22Fa"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-mono text-[#22c55e] hover:underline break-all"
                >
                  0x471C4c43672be2d49A2ceC79203c23b7194A22Fa
                </a>
              </div>
            </div>

            <div className="mt-6 pt-6 border-t border-[#262626]">
              <h4 className="font-medium mb-3">What gets stored on-chain</h4>
              <ul className="text-sm text-[#737373] space-y-2">
                <li>• Identity hash (SHA-256 of configuration)</li>
                <li>• Creator address</li>
                <li>• Timestamp of anchoring</li>
                <li>• Revocation status</li>
              </ul>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-[#22c55e]">FAQ</h2>

          <div className="space-y-4">
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <h4 className="font-medium mb-2">Is it free?</h4>
              <p className="text-sm text-[#737373]">
                Yes! Registration and on-chain anchoring are completely free. We pay all blockchain gas fees.
              </p>
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <h4 className="font-medium mb-2">Do I need a wallet?</h4>
              <p className="text-sm text-[#737373]">
                For attestation and fingerprint, a wallet signature increases trust score but is optional.
                For self-claim, no wallet is needed - the agent uses its own Ed25519 keypair.
              </p>
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <h4 className="font-medium mb-2">What does &quot;verified&quot; mean?</h4>
              <p className="text-sm text-[#737373]">
                &quot;Verified on-chain&quot; means the identity hash is permanently recorded on Base blockchain.
                It proves the identity existed at that moment, not that the agent behaves correctly.
              </p>
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <h4 className="font-medium mb-2">Can I update my agent?</h4>
              <p className="text-sm text-[#737373]">
                Yes. Changes to your agent&apos;s configuration will produce a new identity hash.
                You can register the new version while keeping the old one for reference.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center py-12 border-t border-[#262626]">
          <h2 className="text-2xl font-semibold mb-4">Ready to verify your agent?</h2>
          <p className="text-[#737373] mb-6">
            Get started in under 60 seconds with our CLI
          </p>
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 inline-block">
            <code className="text-[#22c55e]">npx agentidbase attest</code>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#262626] py-8">
        <div className="max-w-4xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4 text-sm text-[#737373]">
          <p>AgentID - Cryptographic identity for AI agents</p>
          <div className="flex items-center gap-6">
            <a href="https://twitter.com/agentidbase" target="_blank" rel="noopener noreferrer" className="hover:text-[#e5e5e5]">Twitter</a>
            <a href="https://github.com/agentidonchain-cpu/agent-id" target="_blank" rel="noopener noreferrer" className="hover:text-[#e5e5e5]">GitHub</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
