"use client";

import { useEffect, useState, useRef, useCallback } from "react";

const CONTRACT_ADDRESS = "0x471C4c43672be2d49A2ceC79203c23b7194A22Fa";
const TOKEN_ADDRESS = "0x15F6A278eB7dAaB20d31Eb0c9E5a7200CF93ab07";
const RPC_URL = "https://mainnet.base.org";
const CHAIN = "Base Mainnet";
const CHAIN_ID = "8453";
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "wss://agent007-api-production.up.railway.app/ws";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://agent007-api-production.up.railway.app";

// Types for WebSocket events
interface AgentEvent {
  id: string;
  type: 'registered' | 'anchored';
  identityHash: string;
  displayName: string;
  provider?: string;
  timestamp: Date;
}

export default function Home() {
  const [stats, setStats] = useState({ anchored: 0, active: 0 });
  const [copied, setCopied] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [isLive, setIsLive] = useState(false);
  const [recentAgents, setRecentAgents] = useState<AgentEvent[]>([]);
  const [animatedCount, setAnimatedCount] = useState(0);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Animate counter
  useEffect(() => {
    if (stats.anchored === 0) return;

    const duration = 1500;
    const steps = 30;
    const increment = stats.anchored / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= stats.anchored) {
        setAnimatedCount(stats.anchored);
        clearInterval(timer);
      } else {
        setAnimatedCount(Math.floor(current));
      }
    }, duration / steps);

    return () => clearInterval(timer);
  }, [stats.anchored]);

  // WebSocket connection
  const connectWebSocket = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsLive(true);
        // Subscribe to stats and all channels
        ws.send(JSON.stringify({ action: 'subscribe', channel: 'stats' }));
        ws.send(JSON.stringify({ action: 'subscribe', channel: 'all' }));
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);

          if (message.type === 'stats.update') {
            setStats({
              anchored: message.data.totalAnchored || message.data.totalAgents || 0,
              active: message.data.totalAgents || 0,
            });
            setLastUpdate(new Date());
          }

          if (message.type === 'agent.registered' || message.type === 'agent.anchored') {
            const newAgent: AgentEvent = {
              id: message.data.identityHash + Date.now(),
              type: message.type === 'agent.registered' ? 'registered' : 'anchored',
              identityHash: message.data.identityHash,
              displayName: message.data.displayName || 'Unknown Agent',
              provider: message.data.provider,
              timestamp: new Date(message.timestamp),
            };

            setRecentAgents(prev => [newAgent, ...prev].slice(0, 10));

            // Update stats immediately for new registrations
            if (message.type === 'agent.registered') {
              setStats(prev => ({ ...prev, active: prev.active + 1 }));
            }
            if (message.type === 'agent.anchored') {
              setStats(prev => ({ ...prev, anchored: prev.anchored + 1 }));
            }
          }
        } catch (e) {
          // Ignore parse errors
        }
      };

      ws.onclose = () => {
        setIsLive(false);
        // Reconnect after 5 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          connectWebSocket();
        }, 5000);
      };

      ws.onerror = () => {
        setIsLive(false);
      };
    } catch (e) {
      setIsLive(false);
    }
  }, []);

  // Fetch initial stats from API (faster than blockchain)
  useEffect(() => {
    const fetchStats = async () => {
      try {
        // Try V2 API first
        const response = await fetch(`${API_URL}/api/v2/agents/stats`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            setStats({
              anchored: result.data.totalAnchored || result.data.totalAgents || 0,
              active: result.data.totalAgents || 0,
            });
            setLastUpdate(new Date());
            return;
          }
        }

        // Fallback to blockchain
        const data = "0xc59d4847"; // getStats() selector
        const rpcResponse = await fetch(RPC_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "eth_call",
            params: [{ to: CONTRACT_ADDRESS, data }, "latest"],
          }),
        });

        const rpcResult = await rpcResponse.json();
        if (rpcResult.result && rpcResult.result !== "0x") {
          const hex = rpcResult.result.slice(2);
          const anchored = parseInt(hex.slice(0, 64), 16);
          const active = parseInt(hex.slice(128, 192), 16);
          setStats({ anchored, active });
          setLastUpdate(new Date());
        }
      } catch {
        // API/RPC not available, keep current stats
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch recent agents for live feed on mount
  useEffect(() => {
    const fetchRecentAgents = async () => {
      try {
        const response = await fetch(`${API_URL}/api/v2/agents/recent?limit=10`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            const agents: AgentEvent[] = result.data.map((agent: any) => ({
              id: agent.identityHash + Date.now(),
              type: 'registered' as const,
              identityHash: agent.identityHash,
              displayName: agent.displayName || 'Unknown Agent',
              provider: agent.provider,
              timestamp: new Date(agent.timestamp),
            }));
            setRecentAgents(agents);
          }
        }
      } catch {
        // Failed to fetch recent agents
      }
    };

    fetchRecentAgents();
  }, []);

  // Connect WebSocket on mount
  useEffect(() => {
    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectWebSocket]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopied(id);
    setTimeout(() => setCopied(null), 2000);
  };

  const formatTimeAgo = (date: Date) => {
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-[#262626] bg-[#0a0a0a]/90 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-semibold tracking-tight">AgentID</span>
            {isLive && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs text-[#22c55e] bg-[#22c55e]/10 rounded-full border border-[#22c55e]/30">
                <span className="w-1.5 h-1.5 bg-[#22c55e] rounded-full animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <nav className="flex items-center gap-6 text-sm text-[#737373]">
            <a href="/docs" className="hover:text-[#e5e5e5] transition-colors">Docs</a>
            <a href="/agents" className="hover:text-[#e5e5e5] transition-colors">Agents</a>
            <a href="https://github.com/agentidonchain-cpu/agent-id" target="_blank" rel="noopener noreferrer" className="hover:text-[#e5e5e5] transition-colors">GitHub</a>
            <a href="https://twitter.com/agentidbase" target="_blank" rel="noopener noreferrer" className="hover:text-[#e5e5e5] transition-colors">Twitter</a>
            <a href="https://medium.com/@agentid" target="_blank" rel="noopener noreferrer" className="hover:text-[#e5e5e5] transition-colors">Medium</a>
          </nav>
        </div>
      </header>

      {/* Token Launch Banner */}
      <div className="fixed top-[73px] left-0 right-0 z-40 bg-gradient-to-r from-[#22c55e]/20 via-[#22c55e]/10 to-[#22c55e]/20 border-b border-[#22c55e]/30">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-center gap-3 text-sm">
          <span className="inline-flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#22c55e] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#22c55e]"></span>
            </span>
            <span className="text-[#22c55e] font-semibold">NEW</span>
          </span>
          <span className="text-[#e5e5e5]">$AGENTID Token launched on Base!</span>
          <a
            href={`https://basescan.org/token/${TOKEN_ADDRESS}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#22c55e] hover:text-[#4ade80] font-mono text-xs underline underline-offset-2"
          >
            {TOKEN_ADDRESS.slice(0, 10)}...{TOKEN_ADDRESS.slice(-8)}
          </a>
          <a
            href={`https://app.uniswap.org/swap?outputCurrency=${TOKEN_ADDRESS}&chain=base`}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 px-3 py-1 bg-[#22c55e] text-black text-xs font-semibold rounded-full hover:bg-[#4ade80] transition-colors"
          >
            Buy on Uniswap
          </a>
        </div>
      </div>

      <main className="max-w-7xl mx-auto px-6 pt-44 pb-20">
        {/* Hero Section with Counter */}
        <section className="py-12">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Main Content */}
            <div className="lg:col-span-2">
              <h1 className="text-4xl md:text-5xl font-semibold tracking-tight mb-4">
                AgentID
              </h1>
              <p className="text-xl text-[#737373] mb-2">
                Cryptographic identity for AI agents.
              </p>
              <p className="text-[#737373] max-w-xl mb-8">
                Register, fingerprint and verify AI agents on-chain.<br />
                No platform trust required.
              </p>

              {/* Prominent Counter */}
              <div className="bg-gradient-to-br from-[#171717] to-[#0f0f0f] border border-[#262626] rounded-2xl p-8 mb-8 relative overflow-hidden">
                <div className="absolute top-0 right-0 w-64 h-64 bg-[#22c55e]/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
                <div className="relative">
                  <div className="flex items-center gap-3 mb-2">
                    <span className="text-sm text-[#737373] uppercase tracking-wider">Verified Agents</span>
                    {isLive && (
                      <span className="flex items-center gap-1.5 text-xs text-[#22c55e]">
                        <span className="w-1.5 h-1.5 bg-[#22c55e] rounded-full animate-pulse" />
                        Live
                      </span>
                    )}
                  </div>
                  <div className="flex items-baseline gap-3">
                    <span className="text-6xl md:text-7xl font-bold text-[#e5e5e5] tabular-nums">
                      {animatedCount}
                    </span>
                    <span className="text-xl text-[#525252]">agents</span>
                  </div>
                  <div className="flex items-center gap-4 mt-4 text-sm">
                    <span className="text-[#22c55e] flex items-center gap-1.5">
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      On-chain verified
                    </span>
                    <span className="text-[#737373]">on {CHAIN}</span>
                  </div>
                  {lastUpdate && (
                    <div className="mt-3 text-xs text-[#525252]">
                      Last sync: {lastUpdate.toLocaleTimeString()}
                    </div>
                  )}
                </div>
              </div>

              {/* CLI Command */}
              <div className="bg-[#171717] border border-[#262626] rounded-lg p-5 mb-6 group relative">
                <div className="space-y-2">
                  <div>
                    <code className="text-[#22c55e] text-sm md:text-base">npx agentidbase fingerprint</code>
                    <span className="text-[#525252] text-xs ml-3">{'->'} 0xabc123...</span>
                  </div>
                  <div>
                    <code className="text-[#22c55e] text-sm md:text-base">npx agentidbase anchor 0xabc123...</code>
                    <span className="text-[#525252] text-xs ml-3">{'->'} tx hash</span>
                  </div>
                </div>
                <button
                  onClick={() => copyToClipboard("npx agentidbase fingerprint", "cli")}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-[#737373] hover:text-[#e5e5e5] transition-colors opacity-0 group-hover:opacity-100"
                >
                  {copied === "cli" ? "copied" : "copy"}
                </button>
              </div>

              <p className="text-[#737373] text-sm">
                Get the hash. Anchor the hash. Done.
              </p>
            </div>

            {/* Live Feed Sidebar */}
            <div className="lg:col-span-1">
              <div className="bg-[#171717] border border-[#262626] rounded-2xl p-5 sticky top-28">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-[#e5e5e5] uppercase tracking-wider">Live Feed</h3>
                  {isLive ? (
                    <span className="flex items-center gap-1.5 text-xs text-[#22c55e]">
                      <span className="w-1.5 h-1.5 bg-[#22c55e] rounded-full animate-pulse" />
                      Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5 text-xs text-[#737373]">
                      <span className="w-1.5 h-1.5 bg-[#737373] rounded-full" />
                      Connecting...
                    </span>
                  )}
                </div>

                {recentAgents.length > 0 ? (
                  <div className="space-y-3 max-h-[400px] overflow-y-auto">
                    {recentAgents.map((agent, index) => (
                      <a
                        key={agent.id}
                        href={`/verify/${agent.identityHash}`}
                        className={`block p-3 rounded-lg border transition-all hover:border-[#22c55e]/50 ${
                          index === 0 ? 'bg-[#22c55e]/5 border-[#22c55e]/20 animate-slide-in' : 'bg-[#0f0f0f] border-[#262626]'
                        }`}
                      >
                        <div className="flex items-center justify-between mb-1">
                          <span className={`text-xs px-1.5 py-0.5 rounded ${
                            agent.type === 'registered'
                              ? 'bg-blue-500/20 text-blue-400'
                              : 'bg-[#22c55e]/20 text-[#22c55e]'
                          }`}>
                            {agent.type === 'registered' ? 'NEW' : 'ANCHORED'}
                          </span>
                          <span className="text-xs text-[#525252]">
                            {formatTimeAgo(agent.timestamp)}
                          </span>
                        </div>
                        <div className="text-sm text-[#a3a3a3] truncate font-mono">
                          {agent.identityHash.slice(0, 10)}...{agent.identityHash.slice(-8)}
                        </div>
                        {agent.displayName && agent.displayName !== 'Unknown Agent' && (
                          <div className="text-xs text-[#525252] truncate mt-1">
                            {agent.displayName}
                          </div>
                        )}
                      </a>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <div className="text-[#525252] text-sm mb-2">Waiting for activity...</div>
                    <div className="text-[#3f3f3f] text-xs">New agents will appear here in real-time</div>
                  </div>
                )}

                <div className="mt-4 pt-4 border-t border-[#262626]">
                  <a
                    href="/agents"
                    className="text-sm text-[#22c55e] hover:text-[#4ade80] transition-colors flex items-center gap-1"
                  >
                    View all agents
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div className="border-t border-[#262626] my-12" />

        {/* Why AgentID */}
        <section className="py-12">
          <div className="bg-[#171717] border border-[#262626] rounded-lg p-6 max-w-3xl">
            <p className="text-[#a3a3a3] leading-relaxed">
              <span className="text-[#e5e5e5] font-medium">Why AgentID?</span> As AI agents proliferate,
              there&apos;s no standard way to verify their identity or authenticity. Anyone can claim
              to be any agent. AgentID solves this by creating a cryptographic fingerprint of each
              agent&apos;s configuration and anchoring it on-chain — providing immutable proof of
              identity that anyone can verify, without trusting a central authority.
            </p>
          </div>
        </section>

        <div className="border-t border-[#262626] my-12" />

        {/* New Features Section */}
        <section className="py-12">
          <h2 className="text-2xl font-semibold mb-8">Features</h2>

          <div className="grid gap-6 md:grid-cols-3">
            {/* Twitter Verification */}
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-6 hover:border-[#22c55e]/50 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-[#1DA1F2]/20 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#1DA1F2]" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-[#e5e5e5]">Twitter Verification</h3>
              </div>
              <p className="text-[#737373] text-sm mb-4">
                Link your agent to a Twitter account. Prove social presence without OAuth complexity.
              </p>
              <div className="text-xs text-[#525252]">
                <code className="text-[#22c55e]">npx agentidbase twitter @handle</code>
              </div>
            </div>

            {/* SVG Certificates */}
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-6 hover:border-[#22c55e]/50 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-[#22c55e]/20 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#22c55e]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-[#e5e5e5]">SVG Certificates</h3>
              </div>
              <p className="text-[#737373] text-sm mb-4">
                Embeddable verification badges. Show your agent&apos;s verified status anywhere.
              </p>
              <div className="text-xs text-[#525252]">
                <code className="text-[#22c55e]">/api/v2/agents/:hash/certificate.svg</code>
              </div>
            </div>

            {/* Trust Scores */}
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-6 hover:border-[#22c55e]/50 transition-colors">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-[#a855f7]/20 rounded-lg flex items-center justify-center">
                  <svg className="w-5 h-5 text-[#a855f7]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-semibold text-[#e5e5e5]">Trust Scores</h3>
              </div>
              <p className="text-[#737373] text-sm mb-4">
                Multi-factor trust calculation. Wallet signature, on-chain anchor, Twitter proof.
              </p>
              <div className="flex items-center gap-2 text-xs">
                <span className="px-2 py-1 bg-[#22c55e]/20 text-[#22c55e] rounded">30% Keypair</span>
                <span className="px-2 py-1 bg-[#22c55e]/20 text-[#22c55e] rounded">50% Wallet</span>
                <span className="px-2 py-1 bg-[#22c55e]/20 text-[#22c55e] rounded">+20% Chain</span>
              </div>
            </div>
          </div>
        </section>

        <div className="border-t border-[#262626] my-12" />

        {/* CLI Section */}
        <section className="py-12">
          <h2 className="text-2xl font-semibold mb-8">Register your agent via terminal</h2>

          <p className="text-[#737373] text-sm mb-6">
            This command generates a cryptographic identity for your agent
            and anchors it on {CHAIN}.<br />
            No UI. No lock-in. No hidden state.
          </p>

          <ul className="space-y-2 text-sm text-[#737373] mb-8">
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
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="bg-[#171717] border border-[#22c55e]/30 rounded-lg p-4 text-sm">
              <span className="text-[#737373]"># Get hash</span><br />
              <code className="text-[#22c55e]">npx agentidbase fingerprint</code>
            </div>
            <div className="bg-[#171717] border border-[#22c55e]/30 rounded-lg p-4 text-sm">
              <span className="text-[#737373]"># Register hash</span><br />
              <code className="text-[#22c55e]">npx agentidbase anchor &lt;hash&gt;</code>
            </div>
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 text-sm">
              <span className="text-[#737373]"># Verify hash</span><br />
              <code className="text-[#22c55e]">npx agentidbase verify &lt;hash&gt;</code>
            </div>
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 text-sm">
              <span className="text-[#737373]"># Link Twitter</span><br />
              <code className="text-[#22c55e]">npx agentidbase twitter @handle</code>
            </div>
            <div className="bg-[#171717] border border-[#262626] rounded-lg p-4 text-sm">
              <span className="text-[#737373]"># Generate QR</span><br />
              <code className="text-[#22c55e]">npx agentidbase qr &lt;hash&gt;</code>
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
            <code className="text-[#737373] text-sm">https://id-agent.org/verify/</code>
            <code className="text-[#22c55e] text-sm">0x7f83b166...</code>
          </div>

          <p className="text-[#737373] text-sm mb-4">Each agent page displays:</p>

          <ul className="space-y-1 text-sm text-[#737373]">
            <li>- Identity hash + QR code</li>
            <li>- Trust score + verification status</li>
            <li>- Transaction hash (link to BaseScan)</li>
            <li>- Block number (link to BaseScan)</li>
            <li>- Contract address for manual verification</li>
            <li>- Twitter verification (if linked)</li>
            <li>- Embeddable SVG certificate</li>
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

          <div className="grid gap-4 text-sm max-w-2xl">
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
              <span className="text-[#737373]">Identity Contract</span>
              <div className="flex items-center gap-2">
                <span className="text-[#ef4444] text-xs px-1.5 py-0.5 bg-[#ef4444]/10 rounded">NOT A TOKEN</span>
                <a
                  href={`https://basescan.org/address/${CONTRACT_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#737373] hover:underline font-mono text-xs"
                >
                  {CONTRACT_ADDRESS.slice(0, 10)}...{CONTRACT_ADDRESS.slice(-8)}
                </a>
              </div>
            </div>
            <div className="flex justify-between border-b border-[#262626] pb-2">
              <span className="text-[#737373]">$AGENTID Token</span>
              <div className="flex items-center gap-2">
                <span className="text-[#22c55e] text-xs px-1.5 py-0.5 bg-[#22c55e]/10 rounded">OFFICIAL</span>
                <a
                  href={`https://basescan.org/token/${TOKEN_ADDRESS}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#22c55e] hover:underline font-mono text-xs"
                >
                  {TOKEN_ADDRESS.slice(0, 10)}...{TOKEN_ADDRESS.slice(-8)}
                </a>
              </div>
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

          {/* Important Warning Box */}
          <div className="mt-8 p-5 bg-[#ef4444]/5 border border-[#ef4444]/30 rounded-lg max-w-2xl">
            <div className="flex items-start gap-3">
              <div className="text-[#ef4444] text-xl mt-0.5">⚠️</div>
              <div>
                <h4 className="text-[#ef4444] font-semibold mb-2">Important: Two Different Contracts</h4>
                <p className="text-[#a3a3a3] text-sm mb-3">
                  The <span className="text-[#e5e5e5] font-mono">Identity Registry Contract</span> is <span className="text-[#ef4444] font-semibold">NOT a token</span>.
                  It is a technical contract that stores cryptographic hashes of AI agents on-chain.
                  <span className="text-[#ef4444]"> Do not attempt to buy or trade this contract address.</span>
                </p>
                <div className="grid gap-2 text-sm">
                  <div className="flex items-center gap-2 p-2 bg-[#ef4444]/10 rounded">
                    <span className="text-[#ef4444]">✗</span>
                    <span className="text-[#737373]">Identity Registry:</span>
                    <code className="text-[#ef4444] font-mono text-xs">{CONTRACT_ADDRESS.slice(0, 14)}...</code>
                    <span className="text-[#ef4444] text-xs">← NOT A TOKEN</span>
                  </div>
                  <div className="flex items-center gap-2 p-2 bg-[#22c55e]/10 rounded">
                    <span className="text-[#22c55e]">✓</span>
                    <span className="text-[#737373]">$AGENTID Token:</span>
                    <code className="text-[#22c55e] font-mono text-xs">{TOKEN_ADDRESS.slice(0, 14)}...</code>
                    <span className="text-[#22c55e] text-xs">← OFFICIAL TOKEN</span>
                  </div>
                </div>
              </div>
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
              href="https://twitter.com/agentidbase"
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
            <a
              href={`https://basescan.org/token/${TOKEN_ADDRESS}`}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[#22c55e]/50 rounded-lg p-4 hover:border-[#22c55e] transition-colors bg-[#22c55e]/5"
            >
              <div className="text-[#22c55e] mb-1">$AGENTID Token</div>
              <div className="text-[#737373] text-xs">Governance token on Base</div>
            </a>
            <a
              href={`https://app.uniswap.org/swap?outputCurrency=${TOKEN_ADDRESS}&chain=base`}
              target="_blank"
              rel="noopener noreferrer"
              className="border border-[#262626] rounded-lg p-4 hover:border-[#737373] transition-colors"
            >
              <div className="text-[#e5e5e5] mb-1">Uniswap</div>
              <div className="text-[#737373] text-xs">Trade $AGENTID</div>
            </a>
          </div>

          <p className="text-xs text-[#525252] mt-6">
            The Identity Registry contract anchors agent fingerprints on-chain. The $AGENTID token powers governance.
          </p>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[#262626] py-12">
        <div className="max-w-7xl mx-auto px-6">
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
