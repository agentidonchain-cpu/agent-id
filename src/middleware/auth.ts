/**
 * Agent007 - Authentication Middleware
 *
 * Handles API key authentication and JWT token verification.
 */

import type { Request, Response, NextFunction } from 'express';
import { getEncryptionService } from '../services/security/encryption.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface AuthenticatedRequest extends Request {
  creator?: {
    id: string;
    email: string;
    displayName: string;
  };
  apiKeyPrefix?: string;
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

/**
 * Extracts API key from request headers
 */
function extractApiKey(req: Request): string | null {
  // Check Authorization header (Bearer token)
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice(7);
  }

  // Check X-API-Key header
  const apiKeyHeader = req.headers['x-api-key'];
  if (typeof apiKeyHeader === 'string') {
    return apiKeyHeader;
  }

  return null;
}

/**
 * Validates API key format
 */
function isValidApiKeyFormat(apiKey: string): boolean {
  // Format: agent007_<base64url>
  return /^agent007_[A-Za-z0-9_-]{32}$/.test(apiKey);
}

/**
 * API Key authentication middleware
 */
export async function apiKeyAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const apiKey = extractApiKey(req);

    if (!apiKey) {
      res.status(401).json({
        success: false,
        error: {
          code: 'MISSING_API_KEY',
          message: 'API key is required. Provide via Authorization header or X-API-Key.',
        },
      });
      return;
    }

    if (!isValidApiKeyFormat(apiKey)) {
      res.status(401).json({
        success: false,
        error: {
          code: 'INVALID_API_KEY_FORMAT',
          message: 'Invalid API key format.',
        },
      });
      return;
    }

    // Hash the API key for lookup
    const encryptionService = getEncryptionService();
    const apiKeyHash = encryptionService.hashApiKey(apiKey);

    // Store prefix for logging (don't log full key)
    req.apiKeyPrefix = apiKey.slice(0, 16);

    // TODO: Look up creator by API key hash in database
    // For MVP, we'll skip database lookup and just validate format
    // In production:
    // const creator = await db.creators.findByApiKeyHash(apiKeyHash);
    // if (!creator) { ... }

    // Placeholder creator for MVP
    req.creator = {
      id: 'placeholder-creator-id',
      email: 'placeholder@example.com',
      displayName: 'Placeholder Creator',
    };

    logger.debug({ apiKeyPrefix: req.apiKeyPrefix }, 'API key authenticated');

    next();
  } catch (error) {
    logger.error({ error }, 'API key authentication error');
    res.status(500).json({
      success: false,
      error: {
        code: 'AUTH_ERROR',
        message: 'Authentication failed.',
      },
    });
  }
}

/**
 * Optional API key authentication (doesn't fail if missing)
 */
export async function optionalApiKeyAuth(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  const apiKey = extractApiKey(req);

  if (apiKey) {
    return apiKeyAuth(req, res, next);
  }

  next();
}

/**
 * Rate limiting key generator
 */
export function getRateLimitKey(req: AuthenticatedRequest): string {
  // Use API key prefix if authenticated, otherwise use IP
  if (req.apiKeyPrefix) {
    return `api:${req.apiKeyPrefix}`;
  }

  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  return `ip:${ip}`;
}
