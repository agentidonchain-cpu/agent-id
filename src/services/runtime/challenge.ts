/**
 * AgentID - Runtime Attestation Protocol (RAP)
 * Challenge Service
 *
 * Handles creation and validation of challenges for runtime attestation.
 */

import { randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../../utils/logger.js';
import type {
  Challenge,
  ChallengeRequest,
  ChallengeResponse,
} from '../../types/runtime.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** Challenge expiration time in milliseconds (5 minutes) */
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/** Nonce length in bytes */
const NONCE_LENGTH = 32;

/** Maximum pending challenges per identity */
const MAX_PENDING_PER_IDENTITY = 5;

// =============================================================================
// IN-MEMORY STORAGE (Use Redis in production)
// =============================================================================

const challenges = new Map<string, Challenge>();

// Cleanup expired challenges every minute
setInterval(() => {
  const now = new Date();
  let cleaned = 0;
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt < now && challenge.status === 'pending') {
      challenge.status = 'expired';
      challenges.delete(id);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug({ cleaned }, 'Cleaned up expired challenges');
  }
}, 60 * 1000);

// =============================================================================
// CHALLENGE SERVICE
// =============================================================================

/**
 * Generate a cryptographically secure nonce
 */
function generateNonce(): string {
  return randomBytes(NONCE_LENGTH).toString('hex');
}

/**
 * Create a new challenge for an agent
 */
export async function createChallenge(
  request: ChallengeRequest
): Promise<ChallengeResponse> {
  const { targetIdentityHash, callbackUrl, challengerIdentityHash } = request;

  // Validate identity hash format
  if (!/^0x[a-fA-F0-9]{64}$/.test(targetIdentityHash)) {
    throw new Error('Invalid identity hash format');
  }

  // Check for too many pending challenges
  let pendingCount = 0;
  for (const challenge of challenges.values()) {
    if (
      challenge.targetIdentityHash === targetIdentityHash &&
      challenge.status === 'pending'
    ) {
      pendingCount++;
    }
  }

  if (pendingCount >= MAX_PENDING_PER_IDENTITY) {
    throw new Error('Too many pending challenges for this identity');
  }

  // Generate challenge
  const challengeId = `rap_${uuidv4()}`;
  const nonce = generateNonce();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CHALLENGE_TTL_MS);

  const challenge: Challenge = {
    id: challengeId,
    targetIdentityHash,
    nonce,
    createdAt: now,
    expiresAt,
    callbackUrl,
    challenger: {
      type: challengerIdentityHash ? 'agent' : 'anonymous',
      identityHash: challengerIdentityHash,
    },
    status: 'pending',
  };

  challenges.set(challengeId, challenge);

  logger.info(
    {
      challengeId,
      targetIdentityHash: targetIdentityHash.slice(0, 10) + '...',
      expiresAt: expiresAt.toISOString(),
    },
    'Created runtime attestation challenge'
  );

  // Build challenge URL (agent should POST attestation here)
  const baseUrl = process.env.API_BASE_URL || 'https://api.id-agent.org';
  const challengeUrl = `${baseUrl}/api/v1/runtime/attest`;

  return {
    challengeId,
    nonce,
    expiresAt: expiresAt.toISOString(),
    challengeUrl,
    targetIdentityHash,
  };
}

/**
 * Get a challenge by ID
 */
export function getChallenge(challengeId: string): Challenge | null {
  const challenge = challenges.get(challengeId);

  if (!challenge) {
    return null;
  }

  // Check if expired
  if (challenge.expiresAt < new Date() && challenge.status === 'pending') {
    challenge.status = 'expired';
  }

  return challenge;
}

/**
 * Validate a challenge for attestation submission
 */
export function validateChallenge(
  challengeId: string,
  nonce: string,
  identityHash: string
): { valid: boolean; error?: string; challenge?: Challenge } {
  const challenge = getChallenge(challengeId);

  if (!challenge) {
    return { valid: false, error: 'Challenge not found' };
  }

  if (challenge.status === 'expired') {
    return { valid: false, error: 'Challenge has expired' };
  }

  if (challenge.status === 'responded') {
    return { valid: false, error: 'Challenge already responded to' };
  }

  if (challenge.status !== 'pending') {
    return { valid: false, error: `Invalid challenge status: ${challenge.status}` };
  }

  if (challenge.nonce !== nonce) {
    return { valid: false, error: 'Invalid nonce' };
  }

  if (challenge.targetIdentityHash.toLowerCase() !== identityHash.toLowerCase()) {
    return { valid: false, error: 'Identity hash mismatch' };
  }

  // Check expiration
  if (challenge.expiresAt < new Date()) {
    challenge.status = 'expired';
    return { valid: false, error: 'Challenge has expired' };
  }

  return { valid: true, challenge };
}

/**
 * Mark a challenge as responded
 */
export function markChallengeResponded(challengeId: string): void {
  const challenge = challenges.get(challengeId);
  if (challenge) {
    challenge.status = 'responded';
  }
}

/**
 * Mark a challenge as verified (successful attestation)
 */
export function markChallengeVerified(challengeId: string): void {
  const challenge = challenges.get(challengeId);
  if (challenge) {
    challenge.status = 'verified';
  }
}

/**
 * Mark a challenge as failed
 */
export function markChallengeFailed(challengeId: string): void {
  const challenge = challenges.get(challengeId);
  if (challenge) {
    challenge.status = 'failed';
  }
}

/**
 * Get all pending challenges for an identity
 */
export function getPendingChallenges(identityHash: string): Challenge[] {
  const result: Challenge[] = [];
  for (const challenge of challenges.values()) {
    if (
      challenge.targetIdentityHash.toLowerCase() === identityHash.toLowerCase() &&
      challenge.status === 'pending' &&
      challenge.expiresAt > new Date()
    ) {
      result.push(challenge);
    }
  }
  return result;
}

/**
 * Get challenge statistics
 */
export function getChallengeStats(): {
  total: number;
  pending: number;
  responded: number;
  verified: number;
  expired: number;
  failed: number;
} {
  const stats = {
    total: challenges.size,
    pending: 0,
    responded: 0,
    verified: 0,
    expired: 0,
    failed: 0,
  };

  for (const challenge of challenges.values()) {
    switch (challenge.status) {
      case 'pending':
        stats.pending++;
        break;
      case 'responded':
        stats.responded++;
        break;
      case 'verified':
        stats.verified++;
        break;
      case 'expired':
        stats.expired++;
        break;
      case 'failed':
        stats.failed++;
        break;
    }
  }

  return stats;
}
