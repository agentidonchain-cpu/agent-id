"use client";

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

/**
 * Twitter Verification Page
 * URL: https://id-agent.org/verify/twitter?hash={identityHash}
 *
 * Allows users to link their Twitter account to their AgentID identity.
 */

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://agent007-api-production.up.railway.app';

type PageStatus = 'input' | 'generating' | 'challenge' | 'verifying' | 'success' | 'error';

interface Challenge {
  challengeId: string;
  code: string;
  expiresAt: string;
  suggestedTweet: string;
}

interface VerificationResult {
  handle: string;
  userId: string;
  tweetId: string;
  verifiedAt: string;
  proofUrl: string;
}

// Wrapper component with Suspense for useSearchParams
export default function TwitterVerifyPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen bg-black text-green-400 font-mono flex items-center justify-center p-4">
        <div className="animate-pulse text-xl">Loading...</div>
      </main>
    }>
      <TwitterVerifyContent />
    </Suspense>
  );
}

function TwitterVerifyContent() {
  const searchParams = useSearchParams();
  const initialHash = searchParams.get('hash') || '';

  const [status, setStatus] = useState<PageStatus>('input');
  const [error, setError] = useState<string | null>(null);
  const [identityHash, setIdentityHash] = useState(initialHash);
  const [twitterHandle, setTwitterHandle] = useState('');
  const [tweetUrl, setTweetUrl] = useState('');
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);

  // Timer for challenge expiration
  useEffect(() => {
    if (!challenge) return;

    const expiresAt = new Date(challenge.expiresAt).getTime();
    const updateTimer = () => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setTimeRemaining(remaining);

      if (remaining === 0) {
        setStatus('error');
        setError('Challenge expired. Please start again.');
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [challenge]);

  // Validate identity hash format
  const isValidHash = (hash: string): boolean => {
    return /^0x[a-fA-F0-9]{64}$/.test(hash);
  };

  // Validate Twitter handle
  const isValidHandle = (handle: string): boolean => {
    const cleaned = handle.replace(/^@/, '');
    return /^[a-zA-Z0-9_]{1,15}$/.test(cleaned);
  };

  // Format time remaining
  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Start verification - get challenge
  const handleStartVerification = async () => {
    if (!isValidHash(identityHash)) {
      setError('Invalid identity hash format. Must start with 0x and have 64 hex characters.');
      return;
    }

    if (!isValidHandle(twitterHandle)) {
      setError('Invalid Twitter handle format.');
      return;
    }

    setStatus('generating');
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/v1/verify/twitter/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identityHash,
          handle: twitterHandle.replace(/^@/, ''),
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Failed to create verification challenge');
      }

      setChallenge(data.data);
      setStatus('challenge');
    } catch (err: any) {
      setError(err.message || 'Failed to create verification challenge');
      setStatus('input');
    }
  };

  // Open Twitter intent
  const openTwitterIntent = () => {
    if (!challenge) return;
    const tweetText = encodeURIComponent(challenge.suggestedTweet);
    window.open(`https://twitter.com/intent/tweet?text=${tweetText}`, '_blank');
  };

  // Copy code to clipboard
  const copyCode = () => {
    if (!challenge) return;
    navigator.clipboard.writeText(challenge.code);
  };

  // Confirm verification
  const handleConfirmVerification = async () => {
    if (!challenge || !tweetUrl) return;

    setStatus('verifying');
    setError(null);

    try {
      const response = await fetch(`${API_URL}/api/v1/verify/twitter/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          tweetUrl,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error?.message || 'Verification failed');
      }

      if (!data.data?.verified) {
        throw new Error('Tweet verification failed');
      }

      setResult(data.data.twitter);
      setStatus('success');
    } catch (err: any) {
      setError(err.message || 'Verification failed');
      setStatus('challenge');
    }
  };

  return (
    <main className="min-h-screen bg-black text-green-400 font-mono flex items-center justify-center p-4">
      <div className="max-w-lg w-full">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">
            AGENT<span className="text-green-500">ID</span>
          </h1>
          <p className="text-green-400/60">Twitter Verification</p>
        </div>

        {/* Info Box */}
        <div className="bg-green-500/5 border border-green-500/20 rounded-lg p-4 mb-6">
          <h2 className="text-sm font-bold text-green-300 mb-3">What this proves</h2>
          <div className="space-y-1 text-sm text-green-400/80">
            <p className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              You controlled @handle when you registered
            </p>
            <p className="flex items-center gap-2">
              <span className="text-green-500">✓</span>
              You posted a public verification tweet
            </p>
          </div>
          <div className="mt-3 pt-3 border-t border-green-500/20 space-y-1 text-sm text-green-400/50">
            <p className="flex items-center gap-2">
              <span className="text-red-400">✗</span>
              Does NOT prove the account will always be yours
            </p>
            <p className="flex items-center gap-2">
              <span className="text-red-400">✗</span>
              Does NOT prove your real-world identity
            </p>
          </div>
        </div>

        {/* Input Step */}
        {status === 'input' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-green-400/80 mb-2">
                Agent Identity Hash
              </label>
              <input
                type="text"
                value={identityHash}
                onChange={(e) => setIdentityHash(e.target.value)}
                placeholder="0x..."
                className="w-full bg-black border border-green-500/30 rounded-lg px-4 py-3 text-green-300 placeholder-green-400/30 focus:outline-none focus:border-green-500"
              />
            </div>

            <div>
              <label className="block text-sm text-green-400/80 mb-2">
                Twitter Handle
              </label>
              <input
                type="text"
                value={twitterHandle}
                onChange={(e) => setTwitterHandle(e.target.value)}
                placeholder="@yourhandle"
                className="w-full bg-black border border-green-500/30 rounded-lg px-4 py-3 text-green-300 placeholder-green-400/30 focus:outline-none focus:border-green-500"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={handleStartVerification}
              disabled={!identityHash || !twitterHandle}
              className="w-full px-6 py-4 bg-green-500 hover:bg-green-600 disabled:bg-green-500/30 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors"
            >
              Start Verification
            </button>
          </div>
        )}

        {/* Generating Step */}
        {status === 'generating' && (
          <div className="text-center py-8">
            <div className="animate-spin text-4xl mb-4">⟳</div>
            <p className="text-green-400/80">Generating verification challenge...</p>
          </div>
        )}

        {/* Challenge Step */}
        {(status === 'challenge' || status === 'verifying') && challenge && (
          <div className="space-y-6">
            {/* Timer */}
            <div className="text-center">
              <div className={`text-2xl font-bold ${timeRemaining < 60 ? 'text-yellow-400' : 'text-green-400'}`}>
                {formatTime(timeRemaining)}
              </div>
              <p className="text-xs text-green-400/60">Time remaining</p>
            </div>

            {/* Challenge Code */}
            <div className="bg-black border border-green-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-green-400/60">Verification Code</span>
                <button
                  onClick={copyCode}
                  className="text-xs text-green-500 hover:text-green-400"
                >
                  Copy
                </button>
              </div>
              <div className="text-xl font-bold text-green-300 tracking-wider text-center py-2">
                {challenge.code}
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-3">
              <p className="text-sm text-green-400/80">
                <span className="text-green-500 font-bold">Step 1:</span> Post a public tweet containing this code
              </p>

              <button
                onClick={openTwitterIntent}
                className="w-full px-4 py-3 bg-[#1DA1F2]/20 border border-[#1DA1F2]/30 text-[#1DA1F2] rounded-lg hover:bg-[#1DA1F2]/30 transition-colors flex items-center justify-center gap-2"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                </svg>
                Post on X (Twitter)
              </button>

              <p className="text-sm text-green-400/80">
                <span className="text-green-500 font-bold">Step 2:</span> Paste the tweet URL below
              </p>

              <input
                type="text"
                value={tweetUrl}
                onChange={(e) => setTweetUrl(e.target.value)}
                placeholder="https://x.com/yourhandle/status/..."
                disabled={status === 'verifying'}
                className="w-full bg-black border border-green-500/30 rounded-lg px-4 py-3 text-green-300 placeholder-green-400/30 focus:outline-none focus:border-green-500 disabled:opacity-50"
              />
            </div>

            {error && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              onClick={handleConfirmVerification}
              disabled={!tweetUrl || status === 'verifying'}
              className="w-full px-6 py-4 bg-green-500 hover:bg-green-600 disabled:bg-green-500/30 disabled:cursor-not-allowed text-black font-bold rounded-lg transition-colors"
            >
              {status === 'verifying' ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="animate-spin">⟳</span>
                  Verifying...
                </span>
              ) : (
                'Verify Tweet'
              )}
            </button>
          </div>
        )}

        {/* Success Step */}
        {status === 'success' && result && (
          <div className="text-center space-y-6">
            <div className="text-6xl mb-4">✓</div>
            <h2 className="text-2xl font-bold text-green-400">Verification Complete!</h2>

            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-left space-y-2">
              <div className="flex justify-between">
                <span className="text-green-400/60">Twitter:</span>
                <span className="text-green-300">{result.handle}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-400/60">User ID:</span>
                <span className="text-green-300 font-mono text-sm">{result.userId}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-green-400/60">Verified:</span>
                <span className="text-green-300 text-sm">
                  {new Date(result.verifiedAt).toLocaleString()}
                </span>
              </div>
            </div>

            <div className="text-sm text-green-400/60">
              <p>Your Twitter account is now linked to your agent identity.</p>
              <p className="mt-2">Keep your verification tweet online to maintain proof.</p>
            </div>

            <div className="space-y-3">
              <a
                href={result.proofUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full px-4 py-3 bg-green-500/20 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-colors"
              >
                View Proof Tweet
              </a>
              <a
                href={`/verify/${identityHash}`}
                className="block w-full px-4 py-3 bg-green-500/20 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-colors"
              >
                View Agent Page
              </a>
            </div>
          </div>
        )}

        {/* Error State (expired) */}
        {status === 'error' && (
          <div className="text-center space-y-6">
            <div className="text-6xl mb-4 text-red-400">!</div>
            <h2 className="text-xl text-red-400">{error}</h2>
            <button
              onClick={() => {
                setStatus('input');
                setError(null);
                setChallenge(null);
                setTweetUrl('');
              }}
              className="px-6 py-3 bg-green-500/20 border border-green-500/30 rounded-lg hover:bg-green-500/30 transition-colors"
            >
              Start Over
            </button>
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
