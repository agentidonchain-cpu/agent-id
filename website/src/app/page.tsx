"use client";

import { useEffect, useState } from "react";

const CONTRACT_ADDRESS = "0x471C4c43672be2d49A2ceC79203c23b7194A22Fa";
const CHAIN = "Base Mainnet";
const CHAIN_ID = "8453";

export default function Home() {
  const [stats, setStats] = useState({ totalAgents: 0, totalAnchored: 0 });
  const [copied, setCopied] = useState<string | null>(null);

  // Fetch stats from API
  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("https://api.id-agent.org/api/v1/blockchain/stats");
        const data = await res.json();
        if (data.data?.display) {
          setStats({
            totalAgents: data.data.display.totalAgents || 0,
            totalAnchored: data.data.onChain?.totalAnchored || 0,
          });
        }
      } catch {
        // API not available, use defaults
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-[#262626] bg-[#0a0a0a]/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <span className="text-lg font-semibold tracking-tight">AgentID</span>
          <nav className="flex items-center gap-6 text-sm text-[#737373]">
            <a href="https://docs.id-agent.org" target="_blank" rel="noopener noreferrer" className="hover:text-[#e5e5e5] transition-colors">Docs</a>
            <a href="https://github.com/agentidonchain-cpu/agent-id" target="_blank" rel="noopener noreferrer" className="hover:text-[#e5e5e5] transition-colors">GitHub</a>
            <a href="https://twitter.com/agentidxyz" target="_blank" rel="noopener noreferrer" className="hover:text-[#e5e5e5] transition-colors">Twitter</a>
            <a href="https://medium.com/@agentid" target="_blank" rel="noopener noreferrer" className="hover:text-[#e5e5e5] transition-colors">Medium</a>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-32 pb-20">
        {/* Hero Section */}
        <section className="py-20">
          <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">
            AgentID
          </h1>
          <p className="text-xl text-[#737373] mb-2">
            Cryptographic identity for AI agents.
          </p>
          <p className="text-[#737373] max-w-xl mb-6">
            Register, fingerprint and verify AI agents on-chain.<br />
            No platform trust required.
          </p>

          {/* Why AgentID */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-5 max-w-xl">
            <p className="text-sm text-[#a3a3a3] leading-relaxed">
              <span className="text-[#e5e5e5] font-medium">Why AgentID?</span> As AI agents proliferate,
              there&apos;s no standard way to verify their identity or authenticity. Anyone can claim
              to be any agent. AgentID solves this by creating a cryptographic fingerprint of each
              agent&apos;s configuration and anchoring it on-chain — providing immutable proof of
              identity that anyone can verify, without trusting a central authority.
            </p>
          </div>

          {/* Live Stats */}
          {stats.totalAgents > 0 && (
            <div className="mt-8 inline-flex items-center gap-2 text-sm text-[#737373]">
              <span className="w-2 h-2 bg-[#22c55e] rounded-full animate-pulse" />
              <span>{stats.totalAgents.toLocaleString()} agents registered</span>
            </div>
          )}
        </section>

        <div className="border-t border-[#262626] my-12" />

        {/* CLI Section */}
        <section className="py-12">
          <h2 className="text-2xl font-semibold mb-8">Register your agent via terminal</h2>

          <div className="bg-[#171717] border border-[#262626] rounded-lg p-5 mb-6 group relative">
            <code className="text-[#22c55e] text-sm md:text-base">npx agentidbase register</code>
            <button
              onClick={() => copyToClipboard("npx agentidbase register", "cli")}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#e5e5e5] transition-colors opacity-0 group-hover:opacity-100"
            >
              {copied === "cli" ? "copied" : "copy"}
            </button>
          </div>

          <p className="text-[#737373] text-sm mb-6">
            This command generates a cryptographic identity for your agent
            and anchors it on {CHAIN}.<br />
            No UI. No lock-in. No hidden state.
          </p>

          <ul className="space-y-2 text-sm text-[#737373]">
            <li className="flex items-start gap-2">
              <span className="text-[#22c55e] mt-0.5">-</span>
              Generates a deterministic identity hash
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#22c55e] mt-0.5">-</span>
              Anchors proof of existence on-chain
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#22c55e] mt-0.5">-</span>
              Works independently of AgentID servers
            </li>
            <li className="flex items-start gap-2">
              <span className="text-[#22c55e] mt-0.5">-</span>
              Verifiable by anyone, forever
            </li>
          </ul>

          {/* All CLI Commands */}
          <div className="mt-8 grid gap-3">
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 text-sm">
              <span className="text-[#737373]"># Initialize config</span><br />
              <code className="text-[#22c55e]">npx agentidbase init</code>
            </div>
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 text-sm">
              <span className="text-[#737373]"># Register agent</span><br />
              <code className="text-[#22c55e]">npx agentidbase register</code>
            </div>
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 text-sm">
              <span className="text-[#737373]"># Anchor on-chain</span><br />
              <code className="text-[#22c55e]">npx agentidbase anchor &lt;hash&gt;</code>
            </div>
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 text-sm">
              <span className="text-[#737373]"># Verify identity</span><br />
              <code className="text-[#22c55e]">npx agentidbase verify &lt;hash&gt;</code>
            </div>
          </div>
        </section>

        <div className="border-t border-[#262626] my-12" />

        {/* How it works */}
        <section className="py-12">
          <h2 className="text-2xl font-semibold mb-8">How AgentID works</h2>

          {/* Diagram */}
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-6 mb-8 font-mono text-sm">
            <div className="flex flex-col items-center gap-2 text-center">
              <div className="border border-[#262626] rounded px-4 py-2 bg-[#0a0a0a]">
                Agent Config<br />
                <span className="text-[#737373] text-xs">(system prompt, tools, constraints)</span>
              </div>
              <span className="text-[#737373]">|</span>
              <div className="border border-[#262626] rounded px-4 py-2 bg-[#0a0a0a]">
                SHA-256 Identity Hash
              </div>
              <span className="text-[#737373]">|</span>
              <div className="border border-[#262626] rounded px-4 py-2 bg-[#0a0a0a]">
                Blockchain Anchor<br />
                <span className="text-[#737373] text-xs">({CHAIN})</span>
              </div>
              <span className="text-[#737373]">|</span>
              <div className="border border-[#22c55e] rounded px-4 py-2 bg-[#0a0a0a] text-[#22c55e]">
                Public, immutable proof
              </div>
            </div>
          </div>

          <p className="text-[#737373] max-w-xl">
            AgentID does not execute agents.<br />
            It does not host models.<br />
            <span className="text-[#e5e5e5]">It only certifies identity.</span>
          </p>
        </section>

        <div className="border-t border-[#262626] my-12" />

        {/* Verify without trust */}
        <section className="py-12">
          <h2 className="text-2xl font-semibold mb-8">Verify without trusting AgentID</h2>

          <div className="bg-[#171717] border border-[#262626] rounded-lg p-5 mb-6 overflow-x-auto group relative">
            <code className="text-[#22c55e] text-sm whitespace-pre">
{`cast call ${CONTRACT_ADDRESS} \\
  "verifyIdentity(bytes32)" 0xYOUR_IDENTITY_HASH \\
  --rpc-url https://mainnet.base.org`}
            </code>
            <button
              onClick={() => copyToClipboard(`cast call ${CONTRACT_ADDRESS} "verifyIdentity(bytes32)" 0xYOUR_IDENTITY_HASH --rpc-url https://mainnet.base.org`, "verify")}
              className="absolute right-4 top-4 text-[#737373] hover:text-[#e5e5e5] transition-colors opacity-0 group-hover:opacity-100"
            >
              {copied === "verify" ? "copied" : "copy"}
            </button>
          </div>

          <p className="text-[#737373] mb-4">
            AgentID acts as a cryptographic notary.<br />
            The blockchain is the source of truth.
          </p>

          <p className="text-xs text-[#525252]">
            If AgentID disappears, on-chain proofs remain verifiable.
          </p>
        </section>

        <div className="border-t border-[#262626] my-12" />

        {/* Public Agent Page */}
        <section className="py-12">
          <h2 className="text-2xl font-semibold mb-8">Every agent has a public identity</h2>

          <div className="bg-[#171717] border border-[#262626] rounded-lg p-5 mb-6">
            <code className="text-[#737373] text-sm">https://id-agent.org/agents/</code>
            <code className="text-[#22c55e] text-sm">0x7f83b166...</code>
          </div>

          <p className="text-[#737373] text-sm mb-4">Each agent page displays:</p>

          <ul className="space-y-1 text-sm text-[#737373]">
            <li>- Identity hash</li>
            <li>- Creator address</li>
            <li>- Timestamp</li>
            <li>- Blockchain proof link</li>
            <li>- Verification command</li>
            <li>- Status (active / revoked)</li>
          </ul>

          <p className="text-[#737373] text-sm mt-6">
            Agent pages are generated from on-chain data.<br />
            They are not profiles. <span className="text-[#e5e5e5]">They are proofs.</span>
          </p>
        </section>

        <div className="border-t border-[#262626] my-12" />

        {/* What AgentID is NOT */}
        <section className="py-12">
          <h2 className="text-2xl font-semibold mb-8">What AgentID is not</h2>

          <ul className="space-y-2 text-[#737373]">
            <li className="flex items-center gap-3">
              <span className="text-[#ef4444]">x</span>
              Not an AI marketplace
            </li>
            <li className="flex items-center gap-3">
              <span className="text-[#ef4444]">x</span>
              Not an agent runtime
            </li>
            <li className="flex items-center gap-3">
              <span className="text-[#ef4444]">x</span>
              Not a social network
            </li>
            <li className="flex items-center gap-3">
              <span className="text-[#ef4444]">x</span>
              Not autonomous intelligence
            </li>
          </ul>

          <p className="text-[#e5e5e5] mt-8">
            AgentID certifies what exists. Nothing more.
          </p>
        </section>

        <div className="border-t border-[#262626] my-12" />

        {/* Technical Details */}
        <section className="py-12">
          <h2 className="text-2xl font-semibold mb-8">Technical details</h2>

          <div className="grid gap-4 text-sm">
            <div className="flex justify-between border-b border-[#262626] pb-2">
              <span className="text-[#737373]">Hash algorithm</span>
              <span>SHA-256</span>
            </div>
            <div className="flex justify-between border-b border-[#262626] pb-2">
              <span className="text-[#737373]">Chain</span>
              <span>{CHAIN}</span>
            </div>
            <div className="flex justify-between border-b border-[#262626] pb-2">
              <span className="text-[#737373]">Chain ID</span>
              <span>{CHAIN_ID}</span>
            </div>
            <div className="flex justify-between border-b border-[#262626] pb-2">
              <span className="text-[#737373]">Contract</span>
              <a
                href={`https://basescan.org/address/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#22c55e] hover:underline font-mono text-xs"
              >
                {CONTRACT_ADDRESS.slice(0, 10)}...{CONTRACT_ADDRESS.slice(-8)}
              </a>
            </div>
            <div className="flex justify-between border-b border-[#262626] pb-2">
              <span className="text-[#737373]">Block explorer</span>
              <a
                href="https://basescan.org"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#22c55e]"
              >
                basescan.org
              </a>
            </div>
            <div className="flex justify-between border-b border-[#262626] pb-2">
              <span className="text-[#737373]">CLI package</span>
              <a
                href="https://www.npmjs.com/package/agentidbase"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[#22c55e]"
              >
                agentidbase
              </a>
            </div>
          </div>
        </section>

        <div className="border-t border-[#262626] my-12" />

        {/* Ecosystem */}
        <section className="py-12">
          <h2 className="text-2xl font-semibold mb-8">Ecosystem</h2>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
            <a
              href="https://github.com/agentidonchain-cpu/agent-id"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[#262626] rounded-lg p-4 hover:border-[#737373] transition-colors"
            >
              <div className="text-[#e5e5e5] mb-1">GitHub</div>
              <div className="text-[#737373] text-xs">Source code</div>
            </a>
            <a
              href="https://docs.id-agent.org"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[#262626] rounded-lg p-4 hover:border-[#737373] transition-colors"
            >
              <div className="text-[#e5e5e5] mb-1">Docs</div>
              <div className="text-[#737373] text-xs">API + CLI</div>
            </a>
            <a
              href="https://docs.id-agent.org/gitbook"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[#262626] rounded-lg p-4 hover:border-[#737373] transition-colors"
            >
              <div className="text-[#e5e5e5] mb-1">GitBook</div>
              <div className="text-[#737373] text-xs">Concepts / Specs</div>
            </a>
            <a
              href="https://twitter.com/agentidxyz"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[#262626] rounded-lg p-4 hover:border-[#737373] transition-colors"
            >
              <div className="text-[#e5e5e5] mb-1">Twitter</div>
              <div className="text-[#737373] text-xs">Technical updates</div>
            </a>
            <a
              href="https://medium.com/@agentid"
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[#262626] rounded-lg p-4 hover:border-[#737373] transition-colors"
            >
              <div className="text-[#e5e5e5] mb-1">Medium</div>
              <div className="text-[#737373] text-xs">Deep dives</div>
            </a>
            <a
              href={`https://basescan.org/address/${CONTRACT_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[#262626] rounded-lg p-4 hover:border-[#737373] transition-colors"
            >
              <div className="text-[#e5e5e5] mb-1">Identity Registry</div>
              <div className="text-[#737373] text-xs">On-chain ID contract</div>
            </a>
          </div>

          <p className="text-xs text-[#525252] mt-6">
            Note: The contract is an identity registry for anchoring agent fingerprints — not a token or currency.
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#262626] py-12">
        <div className="max-w-5xl mx-auto px-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <p className="text-[#737373] text-sm">
                AgentID — Minimal truth, anchored on-chain.
              </p>
              <p className="text-[#525252] text-xs mt-1">
                Built on {CHAIN}.
              </p>
            </div>
            <div className="text-[#525252] text-xs">
              Contract: <a href={`https://basescan.org/address/${CONTRACT_ADDRESS}`} target="_blank" rel="noopener noreferrer" className="hover:text-[#737373]">{CONTRACT_ADDRESS.slice(0, 18)}...</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
