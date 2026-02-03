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
            Cryptographic identity for AI agents. Cartório, não incubadora.
          </p>
        </div>

        {/* Quick Start */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-[#22c55e]">Quick Start</h2>

          <div className="bg-gradient-to-r from-[#22c55e]/10 to-transparent border border-[#22c55e]/30 rounded-lg p-6 mb-6">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-2xl">🚀</span>
              <h3 className="text-lg font-medium">Register in 2 commands</h3>
            </div>
            <div className="bg-[#0a0a0a] rounded-lg p-4 mb-3 space-y-2">
              <pre className="text-sm">
                <code className="text-[#22c55e]">npx agentidbase fingerprint</code>
                <span className="text-[#525252] ml-4"># detect identity</span>
              </pre>
              <pre className="text-sm">
                <code className="text-[#22c55e]">npx agentidbase anchor</code>
                <span className="text-[#525252] ml-4"># register on-chain (free)</span>
              </pre>
            </div>
            <p className="text-sm text-[#737373]">
              No questions. No wizard. Just hash and anchor.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <div className="text-2xl mb-2 text-[#22c55e]">1</div>
              <h4 className="font-medium mb-2">Fingerprint</h4>
              <p className="text-sm text-[#737373]">
                Auto-detects your agent from the environment. Checks for OpenClaw manifest, agent.json, or git repo.
              </p>
            </div>
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <div className="text-2xl mb-2 text-[#22c55e]">2</div>
              <h4 className="font-medium mb-2">Anchor</h4>
              <p className="text-sm text-[#737373]">
                Registers your fingerprint on Base blockchain. Free gas - we pay for it.
              </p>
            </div>
          </div>
        </section>

        {/* Philosophy */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-[#22c55e]">Philosophy</h2>

          <div className="bg-[#171717] border border-[#262626] rounded-lg p-6">
            <h3 className="text-lg font-medium mb-4">Cartório, não incubadora</h3>
            <p className="text-[#737373] mb-4">
              AgentID is a notary (cartório), not an incubator. We witness existence, we don&apos;t create agents.
            </p>
            <ul className="space-y-2 text-[#737373]">
              <li className="flex items-start gap-2">
                <span className="text-[#22c55e]">✓</span>
                <span>Witnesses that an agent configuration exists</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#22c55e]">✓</span>
                <span>Creates immutable proof on blockchain</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#22c55e]">✓</span>
                <span>Verifiable by anyone, forever</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#ef4444]">✗</span>
                <span>Does NOT host or run agents</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#ef4444]">✗</span>
                <span>Does NOT validate agent behavior</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-[#ef4444]">✗</span>
                <span>Does NOT ask questions or require wizards</span>
              </li>
            </ul>
          </div>
        </section>

        {/* Auto-Detection */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-[#22c55e]">Auto-Detection</h2>

          <div className="bg-[#171717] border border-[#262626] rounded-lg p-6">
            <p className="text-[#737373] mb-4">
              The <code className="text-[#22c55e]">fingerprint</code> command auto-detects your agent in this priority order:
            </p>

            <div className="space-y-4">
              <div className="flex items-center gap-4 p-3 bg-[#0a0a0a] rounded">
                <span className="text-[#22c55e] font-bold w-6">1.</span>
                <div>
                  <span className="font-medium">openclaw.json</span>
                  <span className="text-[#525252] text-sm ml-2">OpenClaw manifest</span>
                </div>
              </div>
              <div className="flex items-center gap-4 p-3 bg-[#0a0a0a] rounded">
                <span className="text-[#22c55e] font-bold w-6">2.</span>
                <div>
                  <span className="font-medium">agent.json</span>
                  <span className="text-[#525252] text-sm ml-2">Agent config file</span>
                </div>
              </div>
              <div className="flex items-center gap-4 p-3 bg-[#0a0a0a] rounded">
                <span className="text-[#22c55e] font-bold w-6">3.</span>
                <div>
                  <span className="font-medium">.git</span>
                  <span className="text-[#525252] text-sm ml-2">Git commit hash</span>
                </div>
              </div>
              <div className="flex items-center gap-4 p-3 bg-[#0a0a0a] rounded">
                <span className="text-[#22c55e] font-bold w-6">4.</span>
                <div>
                  <span className="font-medium">directory</span>
                  <span className="text-[#525252] text-sm ml-2">Fallback directory hash</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Twitter Verification */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-[#22c55e]">Twitter Verification</h2>

          <div className="bg-[#171717] border border-[#262626] rounded-lg p-6">
            <p className="text-[#737373] mb-4">
              Optionally link your Twitter account to your agent identity for social proof.
            </p>

            <div className="bg-[#0a0a0a] rounded-lg p-4 mb-4">
              <pre className="text-sm overflow-x-auto">
                <code className="text-[#22c55e]">npx agentidbase twitter @yourhandle</code>
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
              The proof is a point-in-time snapshot.
            </div>
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
                <tr className="bg-[#22c55e]/5">
                  <td className="p-4 font-mono text-[#22c55e]">npx agentidbase fingerprint</td>
                  <td className="p-4 text-[#737373]">Auto-detect and generate agent fingerprint</td>
                </tr>
                <tr className="bg-[#22c55e]/5">
                  <td className="p-4 font-mono text-[#22c55e]">npx agentidbase anchor</td>
                  <td className="p-4 text-[#737373]">Register fingerprint on-chain (free)</td>
                </tr>
                <tr>
                  <td className="p-4 font-mono text-[#22c55e]">npx agentidbase verify &lt;hash&gt;</td>
                  <td className="p-4 text-[#737373]">Verify an agent identity on-chain</td>
                </tr>
                <tr>
                  <td className="p-4 font-mono text-[#22c55e]">npx agentidbase twitter @handle</td>
                  <td className="p-4 text-[#737373]">Link Twitter account to your agent</td>
                </tr>
                <tr>
                  <td className="p-4 font-mono text-[#22c55e]">npx agentidbase qr &lt;hash&gt;</td>
                  <td className="p-4 text-[#737373]">Generate QR code for verification</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="mt-4 p-3 bg-[#171717] border border-[#262626] rounded text-sm text-[#737373]">
            <strong>Note:</strong> The <code className="text-[#22c55e]">anchor</code> command does not require a hash argument.
            It automatically recalculates the fingerprint from your environment.
          </div>
        </section>

        {/* API */}
        <section className="mb-16">
          <h2 className="text-2xl font-semibold mb-6 text-[#22c55e]">API Reference</h2>

          <div className="bg-[#171717] border border-[#262626] rounded-lg p-6 mb-6">
            <h3 className="text-lg font-medium mb-2">Base URL</h3>
            <pre className="bg-[#0a0a0a] rounded-lg p-4 text-sm">
              <code className="text-[#737373]">https://agent007-api-production.up.railway.app/api/v1</code>
            </pre>
          </div>

          <div className="space-y-4">
            <div className="bg-[#171717] border border-[#22c55e]/30 rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-medium">POST</span>
                <code className="text-sm">/blockchain/anchor</code>
              </div>
              <p className="text-sm text-[#737373]">Anchor identity hash on-chain (free)</p>
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-blue-500/20 text-blue-400 rounded text-xs font-medium">GET</span>
                <code className="text-sm">/blockchain/verify/:hash</code>
              </div>
              <p className="text-sm text-[#737373]">Verify identity on blockchain</p>
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-medium">POST</span>
                <code className="text-sm">/verify/twitter/init</code>
              </div>
              <p className="text-sm text-[#737373]">Start Twitter verification flow</p>
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-medium">POST</span>
                <code className="text-sm">/verify/twitter/confirm</code>
              </div>
              <p className="text-sm text-[#737373]">Complete Twitter verification</p>
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
              <h4 className="font-medium mb-3">Verify without trusting AgentID</h4>
              <div className="bg-[#0a0a0a] rounded-lg p-4 text-sm overflow-x-auto">
                <code className="text-[#22c55e] whitespace-pre">{`cast call 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa \\
  "verifyIdentity(bytes32)" 0xYOUR_HASH \\
  --rpc-url https://mainnet.base.org`}</code>
              </div>
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
                Yes! On-chain anchoring is completely free. We pay all blockchain gas fees.
              </p>
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <h4 className="font-medium mb-2">Do I need a wallet?</h4>
              <p className="text-sm text-[#737373]">
                No. The CLI handles everything. If you want to anchor with your own wallet,
                use <code className="text-[#22c55e]">--local</code> flag.
              </p>
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <h4 className="font-medium mb-2">What does &quot;registered&quot; mean?</h4>
              <p className="text-sm text-[#737373]">
                &quot;Registered&quot; means the identity hash is permanently recorded on Base blockchain
                with a mined transaction. This is the ONLY definition of registered.
              </p>
            </div>

            <div className="bg-[#171717] border border-[#262626] rounded-lg p-5">
              <h4 className="font-medium mb-2">Why no questions?</h4>
              <p className="text-sm text-[#737373]">
                AgentID follows the CARTÓRIO model - we witness existence, not create agents.
                Your environment determines the fingerprint. No wizard needed.
              </p>
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="text-center py-12 border-t border-[#262626]">
          <h2 className="text-2xl font-semibold mb-4">Ready to register your agent?</h2>
          <p className="text-[#737373] mb-6">
            Two commands. Zero questions.
          </p>
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 inline-block space-y-2">
            <div><code className="text-[#22c55e]">npx agentidbase fingerprint</code></div>
            <div><code className="text-[#22c55e]">npx agentidbase anchor</code></div>
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
