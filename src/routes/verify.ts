/**
 * AgentID - Verification Routes
 *
 * API endpoints for social verification (Twitter, etc.)
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { logger } from '../utils/logger.js';
import { getAgentStorageService } from '../services/storage/index.js';
import { verifyTweet } from '../services/twitter/twitter-api.js';
import { query, checkConnection } from '../config/database.js';
import {
  generateChallengeCode,
  normalizeTwitterHandle,
  parseTweetUrl,
  generateSuggestedTweet,
  type TwitterChallenge,
  type TwitterVerification,
} from '../types/verification.js';
import { ValidationError, NotFoundError } from '../middleware/errorHandler.js';

// =============================================================================
// HELPER: Check if identity exists in either V1 or V2 storage
// =============================================================================

async function identityExists(identityHash: string): Promise<boolean> {
  // Check V1 storage first
  const storage = getAgentStorageService();
  const v1Identity = await storage.getIdentity(identityHash);
  if (v1Identity) {
    return true;
  }

  // Check V2 storage (agent_identities table)
  try {
    const isDbAvailable = await checkConnection();
    if (isDbAvailable) {
      const result = await query<{ count: string }>(
        'SELECT COUNT(*) as count FROM agent_identities WHERE identity_hash = $1',
        [identityHash]
      );
      if (result.rows.length > 0 && parseInt(result.rows[0].count, 10) > 0) {
        return true;
      }
    }
  } catch (error) {
    logger.warn({ error, identityHash }, 'Error checking V2 identity');
  }

  return false;
}

const router = Router();

// =============================================================================
// IN-MEMORY CHALLENGE STORAGE
// =============================================================================

// Store challenges in memory (use Redis in production)
const challenges = new Map<string, TwitterChallenge>();

// Clean up expired challenges every minute
setInterval(() => {
  const now = new Date();
  for (const [id, challenge] of challenges) {
    if (challenge.expiresAt < now) {
      challenges.delete(id);
    }
  }
}, 60 * 1000);

// =============================================================================
// TWITTER VERIFICATION ROUTES
// =============================================================================

/**
 * POST /api/v1/verify/twitter/init
 * Initialize Twitter verification for an agent
 */
const twitterInitSchema = z.object({
  identityHash: z.string().regex(/^0x[a-fA-F0-9]{64}$/, 'Invalid identity hash format'),
  handle: z.string().min(1).max(50),
});

router.post(
  '/twitter/init',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = twitterInitSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { identityHash, handle } = parseResult.data;
      const normalizedHandle = normalizeTwitterHandle(handle);

      logger.info(
        { identityHash: identityHash.slice(0, 10) + '...', handle: normalizedHandle },
        'Twitter verification init requested'
      );

      // Verify the agent exists (check both V1 and V2 storage)
      const exists = await identityExists(identityHash);

      if (!exists) {
        throw new NotFoundError('Agent identity');
      }

      // Check if there's already a pending challenge for this identity+handle
      let existingChallenge: TwitterChallenge | null = null;
      for (const [, challenge] of challenges) {
        if (
          challenge.identityHash === identityHash &&
          challenge.handle === normalizedHandle &&
          challenge.status === 'pending' &&
          challenge.expiresAt > new Date()
        ) {
          existingChallenge = challenge;
          break;
        }
      }

      if (existingChallenge) {
        // Return existing challenge
        res.json({
          success: true,
          data: {
            challengeId: existingChallenge.id,
            code: existingChallenge.code,
            expiresAt: existingChallenge.expiresAt.toISOString(),
            instructions: 'Post a public tweet containing the verification code',
            suggestedTweet: generateSuggestedTweet(existingChallenge.code),
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Generate new challenge
      const challengeId = `tw_${uuidv4()}`;
      const code = generateChallengeCode();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 15 * 60 * 1000); // 15 minutes

      const challenge: TwitterChallenge = {
        id: challengeId,
        identityHash,
        handle: normalizedHandle,
        code,
        status: 'pending',
        createdAt: now,
        expiresAt,
      };

      challenges.set(challengeId, challenge);

      logger.info(
        { challengeId, handle: normalizedHandle, code },
        'Twitter verification challenge created'
      );

      res.status(201).json({
        success: true,
        data: {
          challengeId,
          code,
          expiresAt: expiresAt.toISOString(),
          instructions: 'Post a public tweet containing the verification code',
          suggestedTweet: generateSuggestedTweet(code),
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /api/v1/verify/twitter/confirm
 * Confirm Twitter verification by providing tweet URL
 */
const twitterConfirmSchema = z.object({
  challengeId: z.string().min(1),
  tweetUrl: z.string().url(),
});

router.post(
  '/twitter/confirm',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const parseResult = twitterConfirmSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { challengeId, tweetUrl } = parseResult.data;

      logger.info({ challengeId, tweetUrl }, 'Twitter verification confirm requested');

      // Get the challenge
      const challenge = challenges.get(challengeId);

      if (!challenge) {
        throw new NotFoundError('Verification challenge');
      }

      // Check if expired
      if (challenge.expiresAt < new Date()) {
        challenge.status = 'expired';
        throw new ValidationError('Verification challenge has expired. Please start a new verification.');
      }

      // Check if already verified
      if (challenge.status === 'verified') {
        res.json({
          success: true,
          data: {
            verified: true,
            message: 'This challenge was already verified',
            twitter: {
              handle: challenge.handle,
              tweetId: challenge.tweetId,
              verifiedAt: challenge.verifiedAt?.toISOString(),
              proofUrl: challenge.tweetUrl,
            },
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Parse tweet URL
      const parsed = parseTweetUrl(tweetUrl);
      if (!parsed) {
        throw new ValidationError('Invalid tweet URL. Must be a valid twitter.com or x.com URL.');
      }

      // Verify the tweet
      const result = await verifyTweet(
        parsed.tweetId,
        challenge.code,
        challenge.handle
      );

      if (!result.verified || !result.tweet) {
        challenge.status = 'failed';
        challenge.errorMessage = result.error;

        res.status(400).json({
          success: false,
          error: {
            code: 'VERIFICATION_FAILED',
            message: result.error || 'Tweet verification failed',
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Update challenge as verified
      challenge.status = 'verified';
      challenge.verifiedAt = new Date();
      challenge.tweetId = parsed.tweetId;
      challenge.tweetUrl = tweetUrl;

      // Create verification record
      const verification: TwitterVerification = {
        type: 'twitter',
        handle: challenge.handle,
        userId: result.tweet.author.id,
        tweetId: parsed.tweetId,
        verifiedAt: challenge.verifiedAt.toISOString(),
        proofUrl: tweetUrl,
        challengeCode: challenge.code,
      };

      // Save verification to identity
      const storage = getAgentStorageService();
      await storage.saveTwitterVerification(challenge.identityHash, verification);

      logger.info(
        {
          challengeId,
          identityHash: challenge.identityHash.slice(0, 10) + '...',
          handle: challenge.handle,
          userId: result.tweet.author.id,
        },
        'Twitter verification completed successfully'
      );

      res.json({
        success: true,
        data: {
          verified: true,
          twitter: {
            handle: `@${challenge.handle}`,
            userId: result.tweet.author.id,
            tweetId: parsed.tweetId,
            verifiedAt: challenge.verifiedAt.toISOString(),
            proofUrl: tweetUrl,
          },
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/verify/twitter/challenge/:challengeId
 * Get challenge status
 */
router.get(
  '/twitter/challenge/:challengeId',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { challengeId } = req.params;

      const challenge = challenges.get(challengeId);

      if (!challenge) {
        throw new NotFoundError('Challenge');
      }

      // Check if expired
      if (challenge.expiresAt < new Date() && challenge.status === 'pending') {
        challenge.status = 'expired';
      }

      res.json({
        success: true,
        data: {
          challengeId: challenge.id,
          handle: challenge.handle,
          code: challenge.code,
          status: challenge.status,
          createdAt: challenge.createdAt.toISOString(),
          expiresAt: challenge.expiresAt.toISOString(),
          verifiedAt: challenge.verifiedAt?.toISOString(),
          tweetUrl: challenge.tweetUrl,
          errorMessage: challenge.errorMessage,
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /api/v1/verify/twitter/:identityHash
 * Get Twitter verification status for an identity
 */
router.get(
  '/twitter/:identityHash',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { identityHash } = req.params;

      if (!/^0x[a-fA-F0-9]{64}$/.test(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const storage = getAgentStorageService();
      const verification = await storage.getTwitterVerification(identityHash);

      if (!verification) {
        res.json({
          success: true,
          data: {
            verified: false,
            message: 'No Twitter verification found for this identity',
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          verified: true,
          twitter: {
            ...verification,
            handle: `@${verification.handle}`,
            note: 'Verification snapshot. Tweet may have been deleted.',
          },
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

export default router;
