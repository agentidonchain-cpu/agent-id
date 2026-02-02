"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://agent007-api-production.up.railway.app';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "wss://agent007-api-production.up.railway.app/ws";

interface Agent {
  identityHash: string;
  displayName: string;
  avatar?: string;
  tags: string[];
  model: {
    provider: string;
    modelId: string;
  };
  validatedAt?: string;
  createdAt?: string;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export default function AgentsPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [pagination, setPagination] = useState<Pagination | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [isLive, setIsLive] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Fetch agents from API
  const fetchAgents = useCallback(async (pageNum: number) => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/api/v1/agents?page=${pageNum}&pageSize=20`);

      if (!response.ok) {
        throw new Error('Failed to fetch agents');
      }

      const data = await response.json();
      setAgents(data.data || []);
      setPagination(data.pagination || null);
      setError(null);
    } catch (err: any) {
      setError(err.message || 'Failed to load agents');
    } finally {
      setLoading(false);
    }
  }, []);

  // WebSocket for live updates
  useEffect(() => {
    const connectWebSocket = () => {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setIsLive(true);
          ws.send(JSON.stringify({ action: 'subscribe', channel: 'all' }));
        };

        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'agent.registered') {
              // Add new agent to the top of the list
              const newAgent: Agent = {
                identityHash: message.data.identityHash,
                displayName: message.data.displayName || 'Unknown Agent',
                tags: [],
                model: {
                  provider: message.data.provider || 'unknown',
                  modelId: message.data.modelId || 'unknown',
                },
                validatedAt: message.timestamp,
              };
              setAgents(prev => [newAgent, ...prev.slice(0, 19)]);
              if (pagination) {
                setPagination(prev => prev ? { ...prev, totalItems: prev.totalItems + 1 } : null);
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        };

        ws.onclose = () => {
          setIsLive(false);
          setTimeout(connectWebSocket, 5000);
        };

        ws.onerror = () => {
          setIsLive(false);
        };
      } catch (e) {
        setIsLive(false);
      }
    };

    connectWebSocket();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [pagination]);

  // Initial fetch
  useEffect(() => {
    fetchAgents(page);
  }, [page, fetchAgents]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return 'Unknown';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getProviderColor = (provider: string) => {
    const colors: Record<string, string> = {
      anthropic: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
      openai: 'bg-green-500/20 text-green-400 border-green-500/30',
      google: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      mistral: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      cohere: 'bg-pink-500/20 text-pink-400 border-pink-500/30',
    };
    return colors[provider.toLowerCase()] || 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  };

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50 border-b border-[#262626] bg-[#0a0a0a]/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-lg font-semibold tracking-tight hover:text-[#22c55e] transition-colors">
              AgentID
            </Link>
            {isLive && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 text-xs text-[#22c55e] bg-[#22c55e]/10 rounded-full border border-[#22c55e]/30">
                <span className="w-1.5 h-1.5 bg-[#22c55e] rounded-full animate-pulse" />
                LIVE
              </span>
            )}
          </div>
          <nav className="flex items-center gap-6 text-sm text-[#737373]">
            <a href="https://docs.id-agent.org" target="_blank" rel="noopener noreferrer" className="hover:text-[#e5e5e5] transition-colors">Docs</a>
            <a href="https://github.com/agentidonchain-cpu/agent-id" target="_blank" rel="noopener noreferrer" className="hover:text-[#e5e5e5] transition-colors">GitHub</a>
          </nav>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pt-28 pb-20">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-semibold mb-2">Verified Agents</h1>
          <p className="text-[#737373]">
            All AI agents registered and verified on AgentID
            {pagination && (
              <span className="ml-2 text-[#525252]">
                ({pagination.totalItems} total)
              </span>
            )}
          </p>
        </div>

        {/* Error State */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-6">
            <p className="text-red-400">{error}</p>
            <button
              onClick={() => fetchAgents(page)}
              className="mt-2 text-sm text-red-300 hover:text-red-200 underline"
            >
              Try again
            </button>
          </div>
        )}

        {/* Loading State */}
        {loading && agents.length === 0 && (
          <div className="space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="bg-[#171717] border border-[#262626] rounded-lg p-5 animate-pulse">
                <div className="h-5 bg-[#262626] rounded w-1/3 mb-3" />
                <div className="h-4 bg-[#262626] rounded w-2/3 mb-2" />
                <div className="h-3 bg-[#262626] rounded w-1/4" />
              </div>
            ))}
          </div>
        )}

        {/* Agents List */}
        {!loading && agents.length === 0 && !error && (
          <div className="text-center py-16">
            <div className="text-4xl mb-4">0</div>
            <p className="text-[#737373] mb-6">No agents registered yet</p>
            <Link
              href="/"
              className="inline-block px-6 py-3 bg-[#22c55e] text-black font-semibold rounded-lg hover:bg-[#4ade80] transition-colors"
            >
              Register the first agent
            </Link>
          </div>
        )}

        {agents.length > 0 && (
          <div className="space-y-4">
            {agents.map((agent, index) => (
              <Link
                key={agent.identityHash}
                href={`/verify/${agent.identityHash}`}
                className={`block bg-[#171717] border border-[#262626] rounded-lg p-5 hover:border-[#22c55e]/50 transition-all ${
                  index === 0 && isLive ? 'animate-slide-in' : ''
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <h2 className="text-lg font-medium text-[#e5e5e5] truncate">
                        {agent.displayName || 'Unnamed Agent'}
                      </h2>
                      <span className={`text-xs px-2 py-0.5 rounded border ${getProviderColor(agent.model.provider)}`}>
                        {agent.model.provider}
                      </span>
                    </div>

                    <div className="font-mono text-sm text-[#737373] truncate mb-3">
                      {agent.identityHash.slice(0, 20)}...{agent.identityHash.slice(-12)}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-[#525252]">
                      <span>Model: {agent.model.modelId}</span>
                      <span>Verified: {formatDate(agent.validatedAt || agent.createdAt)}</span>
                    </div>

                    {agent.tags && agent.tags.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-3">
                        {agent.tags.slice(0, 5).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-0.5 bg-[#262626] rounded text-[#737373]"
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="text-[#525252]">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* Pagination */}
        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-center gap-4 mt-8">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-2 bg-[#171717] border border-[#262626] rounded-lg hover:border-[#737373] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            <span className="text-[#737373]">
              Page {page} of {pagination.totalPages}
            </span>

            <button
              onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={page === pagination.totalPages}
              className="px-4 py-2 bg-[#171717] border border-[#262626] rounded-lg hover:border-[#737373] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-[#262626] py-8">
        <div className="max-w-5xl mx-auto px-6 text-center text-sm text-[#525252]">
          <p>AgentID — Cryptographic identity for AI agents</p>
        </div>
      </footer>
    </div>
  );
}
