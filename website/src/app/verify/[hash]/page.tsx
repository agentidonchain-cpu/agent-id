"use client";

import QRCode from '@/components/QRCode';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

/**
 * Agent Verification Page
 * URL: https://id-agent.org/verify/{identityHash}
 */

const CONTRACT_ADDRESS = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';
const BASESCAN_URL = 'https://basescan.org';
const RPC_URL = 'https://mainnet.base.org';

interface AgentData {
  identityHash: string;
  creator: string;
  timestamp: number;
  status: 'verified' | 'pending' | 'not_found';
}

export default function VerifyPage() {
  const params = useParams();
  const hash = params.hash as string;

  const [agent, setAgent] = useState<AgentData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function fetchAgent() {
      if (!hash) return;

      try {
        // Call getIdentity(bytes32) on the contract
        const data = `0xa7867212${hash.slice(2).padStart(64, '0')}`;

        const response = await fetch(RPC_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'eth_call',
            params: [{ to: CONTRACT_ADDRESS, data }, 'latest']
          })
        });

        const result = await response.json();

        if (!result.result || result.result === '0x') {
          setAgent(null);
          setLoading(false);
          return;
        }

        // Decode the response (exists, creator, anchoredAt, revokedAt, isValid)
        const hex = result.result.slice(2);
        const exists = parseInt(hex.slice(0, 64), 16) === 1;

        if (!exists) {
          setAgent(null);
          setLoading(false);
          return;
        }

        const creator = '0x' + hex.slice(64 + 24, 128);
        const anchoredAt = parseInt(hex.slice(128, 192), 16);
        const revokedAt = parseInt(hex.slice(192, 256), 16);
        const isValid = parseInt(hex.slice(256, 320), 16) === 1;

        setAgent({
          identityHash: hash,
          creator: creator,
          timestamp: anchoredAt,
          status: isValid ? 'verified' : (revokedAt > 0 ? 'not_found' : 'pending')
        });
      } catch (error) {
        console.error('Error fetching agent data:', error);
        setAgent(null);
      }
      setLoading(false);
    }

    fetchAgent();
  }, [hash]);

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-black text-green-400 font-mono flex items-center justify-center">
        <div className="text-center">
          <div className="animate-pulse text-2xl mb-4">Loading...</div>
          <p className="text-sm text-green-400/60">Fetching from Base Mainnet</p>
        </div>
      </main>
    );
  }

  if (!agent) {
    return (
      <main className="min-h-screen bg-black text-green-400 font-mono flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-4xl font-bold mb-4">404</h1>
          <p className="text-xl mb-2">Agent Not Found</p>
          <p className="text-sm text-green-400/60 mb-8 break-all max-w-md">
            Identity Hash: {hash}
          </p>
          <a
            href="/"
            className="px-6 py-3 bg-green-500 hover:bg-green-600 text-black font-bold rounded-lg transition-colors"
          >
            Return Home
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-black text-green-400 font-mono">
      {/* Header */}
      <header className="border-b border-green-500/20 bg-black/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <a href="/" className="text-2xl font-bold hover:text-green-300 transition-colors">
            AGENT<span className="text-green-500">ID</span>
          </a>
        </div>
      </header>

      <div className="container mx-auto px-4 py-12 max-w-5xl">
        {/* Status Badge */}
        <div className="mb-8">
          <div className={`inline-block px-4 py-2 border-2 rounded-lg font-bold ${
            agent.status === 'verified'
              ? 'bg-green-500/20 text-green-300 border-green-500'
              : 'bg-red-500/20 text-red-300 border-red-500'
          }`}>
            {agent.status === 'verified' ? 'VERIFIED ON-CHAIN' : 'NOT VERIFIED'}
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid md:grid-cols-2 gap-8">
          {/* Left: QR Code */}
          <section className="flex flex-col items-center justify-start">
            <h2 className="text-xl mb-6 text-green-300">Agent QR Code</h2>
            <QRCode identityHash={hash} size={320} downloadable />

            <div className="mt-6 p-4 bg-green-500/5 border border-green-500/20 rounded-lg w-full">
              <h3 className="text-sm font-bold mb-2 text-green-300">Scan to Verify</h3>
              <p className="text-xs text-green-400/80">
                This QR code links to this verification page. Anyone can scan
                it to instantly verify this agent&apos;s on-chain identity.
              </p>
            </div>
          </section>

          {/* Right: Agent Details */}
          <section>
            <h2 className="text-xl mb-6 text-green-300">Identity Details</h2>

            <div className="space-y-4">
              {/* Identity Hash */}
              <div className="border border-green-500/20 rounded-lg p-3 bg-green-500/5">
                <dt className="text-xs text-green-300 mb-1">Identity Hash</dt>
                <dd className="text-sm font-mono break-all flex items-start gap-2">
                  <span className="text-green-400">{hash}</span>
                  <button
                    onClick={() => copyToClipboard(hash)}
                    className="text-xs text-green-500 hover:text-green-300 shrink-0"
                  >
                    {copied ? '[copied!]' : '[copy]'}
                  </button>
                </dd>
              </div>

              {/* Creator */}
              <div className="border border-green-500/20 rounded-lg p-3 bg-green-500/5">
                <dt className="text-xs text-green-300 mb-1">Creator</dt>
                <dd className="text-sm font-mono break-all">
                  <a
                    href={`${BASESCAN_URL}/address/${agent.creator}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-green-400 hover:text-green-300 underline"
                  >
                    {agent.creator}
                  </a>
                </dd>
              </div>

              {/* Timestamp */}
              <div className="border border-green-500/20 rounded-lg p-3 bg-green-500/5">
                <dt className="text-xs text-green-300 mb-1">Registered</dt>
                <dd className="text-sm text-green-400">
                  {new Date(agent.timestamp * 1000).toLocaleString()}
                </dd>
              </div>

              {/* Chain */}
              <div className="border border-green-500/20 rounded-lg p-3 bg-green-500/5">
                <dt className="text-xs text-green-300 mb-1">Chain</dt>
                <dd className="text-sm text-green-400">Base Mainnet (8453)</dd>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="mt-8 space-y-3">
              <a
                href={`${BASESCAN_URL}/address/${CONTRACT_ADDRESS}`}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-4 py-3 bg-green-500/10 hover:bg-green-500/20 border border-green-500/30 rounded-lg text-center transition-colors"
              >
                View Contract on BaseScan
              </a>

              <div className="p-4 bg-black border border-green-500/20 rounded-lg">
                <p className="text-xs text-green-300 mb-2">Verify via CLI:</p>
                <code className="text-xs text-green-400 block bg-green-500/5 p-2 rounded overflow-x-auto">
                  npx agentidbase verify {hash}
                </code>
              </div>
            </div>

            {/* Share Section */}
            <div className="mt-8">
              <p className="text-xs text-green-300 mb-3">Share this verification:</p>
              <div className="flex flex-wrap gap-2">
                {/* Twitter/X - Primary */}
                <a
                  href={`https://twitter.com/intent/tweet?text=${encodeURIComponent(`🤖 This AI agent is verified on-chain!\n\nIdentity anchored on @base via @agentidbase\n\nVerify it yourself:`)}&url=${encodeURIComponent(`https://id-agent.org/verify/${hash}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-black hover:bg-green-500/10 border border-green-500/30 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                  </svg>
                  <span className="text-sm">Share on X</span>
                </a>

                {/* LinkedIn */}
                <a
                  href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(`https://id-agent.org/verify/${hash}`)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-2 bg-black hover:bg-green-500/10 border border-green-500/30 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
                  </svg>
                  <span className="text-sm">LinkedIn</span>
                </a>

                {/* Copy Link */}
                <button
                  onClick={() => copyToClipboard(`https://id-agent.org/verify/${hash}`)}
                  className="flex items-center gap-2 px-4 py-2 bg-black hover:bg-green-500/10 border border-green-500/30 rounded-lg transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  <span className="text-sm">{copied ? 'Copied!' : 'Copy Link'}</span>
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t border-green-500/20 mt-12 py-6">
        <div className="container mx-auto px-4 text-center text-xs text-green-400/60">
          <p>id-agent.org — Cryptographic identity for AI agents</p>
        </div>
      </footer>
    </main>
  );
}
