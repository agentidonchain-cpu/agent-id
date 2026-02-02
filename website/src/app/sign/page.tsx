"use client";

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

/**
 * Wallet Signing Page
 * URL: https://id-agent.org/sign?session={sessionId}
 *
 * This page is opened by the CLI when user doesn't have a private key.
 * User connects MetaMask, signs the message, and the signature is sent back to the API.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://agent007-api-production.up.railway.app';

interface SigningSession {
  sessionId: string;
  identityHash: string;
  identityType: 'config' | 'attestation';
  message: string;
  status: 'pending' | 'signed' | 'expired' | 'error';
  expiresAt: string;
  csrfToken?: string;
}

type PageStatus = 'loading' | 'ready' | 'connecting' | 'signing' | 'submitting' | 'success' | 'error' | 'expired';

// Wrapper component with Suspense for useSearchParams
export default function SignPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-black text-green-400 font-mono flex items-center justify-center p-4">
        <div className="animate-pulse text-xl">Loading...</div>
      </main>
    }>
      <SignPageContent />
    </Suspense>
  );
}

function SignPageContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session');

  const [session, setSession] = useState<SigningSession | null>(null);
  const [status, setStatus] = useState<PageStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // Fetch session on mount
  useEffect(() => {
    if (!sessionId) {
      setStatus('error');
      setError('No session ID provided. Please start from the CLI.');
      return;
    }

    fetchSession();
  }, [sessionId]);

  async function fetchSession() {
    try {
      const response = await fetch(`${API_URL}/api/v1/sessions/${sessionId}`);

      if (response.status === 404 || response.status === 410) {
        setStatus('expired');
        setError('Session not found or expired. Please try again from the CLI.');
        return;
      }

      if (!response.ok) {
        throw new Error('Failed to fetch session');
      }

      const data = await response.json();

      if (data.status === 'signed') {
        setStatus('success');
        setWalletAddress(data.walletAddress);
        return;
      }

      if (data.status === 'expired') {
        setStatus('expired');
        setError('Session expired. Please try again from the CLI.');
        return;
      }

      setSession(data);
      setStatus('ready');
    } catch (err: any) {
      setStatus('error');
      setError(err.message || 'Failed to load session');
    }
  }

  async function connectWallet() {
    if (typeof window.ethereum === 'undefined') {
      setError('MetaMask not detected. Please install MetaMask extension.');
      return;
    }

    setStatus('connecting');
    setError(null);

    try {
      const accounts = await window.ethereum.request({
        method: 'eth_requestAccounts'
      });

      if (accounts.length === 0) {
        throw new Error('No accounts found. Please unlock MetaMask.');
      }

      setWalletAddress(accounts[0].toLowerCase());
      setStatus('ready');
    } catch (err: any) {
      setStatus('ready');
      if (err.code === 4001) {
        setError('Connection rejected. Please approve the connection in MetaMask.');
      } else {
        setError(err.message || 'Failed to connect wallet');
      }
    }
  }

  async function signMessage() {
    if (!session || !walletAddress) return;

    setStatus('signing');
    setError(null);

    try {
      // Request signature from MetaMask
      const signature = await window.ethereum!.request({
        method: 'personal_sign',
        params: [session.message, walletAddress],
      });

      setStatus('submitting');

      // Submit signature to API with CSRF token
      const response = await fetch(`${API_URL}/api/v1/sessions/${sessionId}/signature`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature,
          walletAddress,
          timestamp: new Date().toISOString(),
          csrfToken: session.csrfToken,
        }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to submit signature');
      }

      setStatus('success');
    } catch (err: any) {
      setStatus('ready');
      if (err.code === 4001) {
        setError('Signature rejected. Please approve the signature in MetaMask.');
      } else {
        setError(err.message || 'Failed to sign message');
      }
    }
  }

  // Render based on status
  return (
    <main className="min-h-screen bg-black text-green-400 font-mono flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">
            AGENT<span className="text-green-500">ID</span>
          </h1>
          <p className="text-green-400/60">Wallet Signature</p>
        </div>

        {/* Loading State */}
        {status === 'loading' && (
          <div className="text-center">
            <div className="animate-pulse text-xl mb-4">Loading session...</div>
          </div>
        )}

        {/* Error State */}
        {status === 'error' && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 text-center">
            <div className="text-red-400 text-xl mb-2">Error</div>
            <p className="text-red-300/80">{error}</p>
            <a
              href="/"
              className="inline-block mt-4 px-4 py-2 bg-green-500/20 border border-green-500/30 rounded hover:bg-green-500/30 transition-colors"
            >
              Return Home
            </a>
          </div>
        )}

        {/* Expired State */}
        {status === 'expired' && (
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-6 text-center">
            <div className="text-yellow-400 text-xl mb-2">Session Expired</div>
            <p className="text-yellow-300/80">{error}</p>
            <p className="text-sm text-yellow-400/60 mt-4">
              Run the register command again in your CLI.
            </p>
          </div>
        )}

        {/* Ready State - Session loaded */}
        {(status === 'ready' || status === 'connecting' || status === 'signing' || status === 'submitting') && session && (
          <div className="space-y-6">
            {/* Session Info */}
            <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4">
              <h2 className="text-sm font-bold text-green-300 mb-3">Signing Request</h2>

              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-green-400/60">Type: </span>
                  <span className="text-green-300">
                    {session.identityType === 'config' ? 'Configuration Identity' : 'Attestation'}
                  </span>
                </div>
                <div>
                  <span className="text-green-400/60">Hash: </span>
                  <span className="text-green-300 break-all">{session.identityHash}</span>
                </div>
              </div>
            </div>

            {/* Message Preview */}
            <div className="bg-black border border-green-500/20 rounded-lg p-4">
              <h2 className="text-sm font-bold text-green-300 mb-3">Message to Sign</h2>
              <pre className="text-xs text-green-400/80 whitespace-pre-wrap overflow-x-auto">
                {session.message}
              </pre>
            </div>

            {/* Wallet Connection */}
            {!walletAddress ? (
              <button
                onClick={connectWallet}
                disabled={status === 'connecting'}
                className="w-full px-6 py-4 bg-green-500 hover:bg-green-600 disabled:bg-green-500/50 text-black font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                {status === 'connecting' ? (
                  <>
                    <span className="animate-spin">⟳</span>
                    Connecting...
                  </>
                ) : (
                  <>
                    <svg className="w-5 h-5" viewBox="0 0 35 33" fill="currentColor">
                      <path d="M32.9 1.3L19.4 11.1l2.5-5.9L32.9 1.3z"/>
                      <path d="M2.1 1.3l13.2 9.9-2.4-5.7L2.1 1.3zM28.1 23.5l-3.5 5.4 7.5 2.1 2.2-7.4-6.2-.1zM1.1 23.6l2.1 7.4 7.5-2.1-3.5-5.4-6.1.1z"/>
                      <path d="M10.4 14.6L8.2 18l7.6.4-.3-8.1-5.1 4.3zM24.6 14.6l-5.2-4.4-.2 8.2 7.6-.4-2.2-3.4zM10.7 28.9l4.6-2.2-4-3.1-.6 5.3zM19.7 26.7l4.6 2.2-.6-5.3-4 3.1z"/>
                    </svg>
                    Connect MetaMask
                  </>
                )}
              </button>
            ) : (
              <div className="space-y-4">
                {/* Connected Wallet */}
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-green-400/60">Connected Wallet</div>
                    <div className="text-sm text-green-300 font-mono">
                      {walletAddress.slice(0, 6)}...{walletAddress.slice(-4)}
                    </div>
                  </div>
                  <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse"></div>
                </div>

                {/* Sign Button */}
                <button
                  onClick={signMessage}
                  disabled={status === 'signing' || status === 'submitting'}
                  className="w-full px-6 py-4 bg-green-500 hover:bg-green-600 disabled:bg-green-500/50 text-black font-bold rounded-lg transition-colors"
                >
                  {status === 'signing' && 'Waiting for signature...'}
                  {status === 'submitting' && 'Submitting...'}
                  {status === 'ready' && 'Sign Message'}
                </button>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            {/* Security Notice */}
            <div className="text-xs text-green-400/40 text-center">
              <p>This signature proves you own this agent identity.</p>
              <p>It does NOT grant access to your funds.</p>
            </div>
          </div>
        )}

        {/* Success State */}
        {status === 'success' && (
          <div className="text-center space-y-6">
            <div className="text-6xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-green-400">Signature Complete!</h2>
            <p className="text-green-400/60">
              Your identity has been signed with wallet:
            </p>
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-3 font-mono text-sm break-all">
              {walletAddress}
            </div>
            <p className="text-green-400/60 text-sm">
              You can close this window and return to your CLI.
            </p>
            <div className="pt-4">
              <a
                href="/"
                className="inline-block px-6 py-3 bg-green-500/20 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-colors"
              >
                Return Home
              </a>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-green-400/40">
          <p>id-agent.org — Cryptographic identity for AI agents</p>
        </div>
      </div>
    </main>
  );
}

// TypeScript declarations for window.ethereum
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: any[] }) => Promise<any>;
      on: (event: string, callback: (...args: any[]) => void) => void;
      removeListener: (event: string, callback: (...args: any[]) => void) => void;
    };
  }
}
