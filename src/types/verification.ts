/**
 * AgentID - Verification Types
 *
 * Types for social verification (Twitter, etc.)
 */

// =============================================================================
// TWITTER VERIFICATION
// =============================================================================

/**
 * Twitter verification challenge
 * Created when user initiates verification
 */
export interface TwitterChallenge {
  id: string;
  identityHash: string;
  handle: string; // @username (without @)
  code: string; // AGENTID-VERIFY-XXXXXX
  status: 'pending' | 'verified' | 'expired' | 'failed';
  createdAt: Date;
  expiresAt: Date;
  verifiedAt?: Date;
  tweetId?: string;
  tweetUrl?: string;
  errorMessage?: string;
}

/**
 * Stored Twitter verification (after successful verification)
 */
export interface TwitterVerification {
  type: 'twitter';
  handle: string; // @username at time of verification
  userId: string; // Twitter numeric ID (immutable)
  tweetId: string; // ID of the verification tweet
  verifiedAt: string; // ISO8601 timestamp
  proofUrl: string; // Full URL to verification tweet
  challengeCode: string; // Code that was verified
}

/**
 * Result from Twitter API tweet fetch
 */
export interface TwitterTweet {
  id: string;
  text: string;
  author: {
    id: string;
    userName: string;
    displayName?: string;
  };
  createdAt: string;
}

/**
 * Twitter verification init request
 */
export interface TwitterVerifyInitRequest {
  identityHash: string;
  handle: string; // Can include @ prefix or not
}

/**
 * Twitter verification init response
 */
export interface TwitterVerifyInitResponse {
  challengeId: string;
  code: string;
  expiresAt: string;
  instructions: string;
  suggestedTweet: string;
}

/**
 * Twitter verification confirm request
 */
export interface TwitterVerifyConfirmRequest {
  challengeId: string;
  tweetUrl: string;
}

/**
 * Twitter verification confirm response
 */
export interface TwitterVerifyConfirmResponse {
  verified: boolean;
  twitter?: {
    handle: string;
    userId: string;
    tweetId: string;
    verifiedAt: string;
    proofUrl: string;
  };
  error?: string;
}

// =============================================================================
// VERIFICATION STORAGE
// =============================================================================

/**
 * All verifications for an identity
 */
export interface IdentityVerifications {
  wallet?: {
    address: string;
    verified: boolean;
    verifiedAt?: string;
  };
  twitter?: TwitterVerification & {
    verified: boolean;
    note: string;
  };
  // Future: github, etc.
}

// =============================================================================
// CHALLENGE CODE GENERATION
// =============================================================================

/**
 * Generate a challenge code
 * Format: AGENTID-VERIFY-{6 hex chars uppercase}
 */
export function generateChallengeCode(): string {
  const randomBytes = require('crypto').randomBytes(3);
  const hex = randomBytes.toString('hex').toUpperCase();
  return `AGENTID-VERIFY-${hex}`;
}

/**
 * Validate a challenge code format
 */
export function isValidChallengeCode(code: string): boolean {
  return /^AGENTID-VERIFY-[A-F0-9]{6}$/.test(code);
}

/**
 * Normalize Twitter handle (remove @ if present, lowercase)
 */
export function normalizeTwitterHandle(handle: string): string {
  return handle.replace(/^@/, '').toLowerCase();
}

/**
 * Parse tweet URL to extract tweet ID
 * Supports: x.com, twitter.com URLs
 */
export function parseTweetUrl(url: string): { tweetId: string; username: string } | null {
  try {
    const urlObj = new URL(url);
    const hostname = urlObj.hostname.toLowerCase();

    if (hostname !== 'x.com' && hostname !== 'twitter.com' && hostname !== 'www.x.com' && hostname !== 'www.twitter.com') {
      return null;
    }

    // URL format: https://x.com/username/status/1234567890
    const pathParts = urlObj.pathname.split('/').filter(Boolean);

    if (pathParts.length < 3 || pathParts[1] !== 'status') {
      return null;
    }

    const username = pathParts[0];
    const tweetId = pathParts[2];

    // Validate tweet ID is numeric
    if (!/^\d+$/.test(tweetId)) {
      return null;
    }

    return { tweetId, username };
  } catch {
    return null;
  }
}

/**
 * Generate suggested tweet text
 */
export function generateSuggestedTweet(code: string): string {
  return `Verifying my AI agent on AgentID

${code}

https://id-agent.org`;
}
