/**
 * OpenClaw Agent ID - API Routes
 *
 * Simple REST API for Agent ID operations.
 *
 * Endpoints:
 * - POST /api/v1/openclaw/register   - Register a manifest, get fingerprint
 * - GET  /api/v1/openclaw/:fp        - Get registered Agent ID
 * - POST /api/v1/openclaw/verify     - Verify manifest against fingerprint
 * - POST /api/v1/openclaw/fingerprint - Calculate fingerprint (no registration)
 * - GET  /api/v1/openclaw            - List registered Agent IDs
 *
 * NO auth required.
 * NO wallet required.
 * NO signature required.
 */

import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import type { OpenClawManifest } from './types.js';
import { canonicalize, validateManifest } from './canonical.js';
import { fingerprint, isValidFingerprint } from './fingerprint.js';
import { verify, verifyAgainstFingerprint } from './verify.js';
import { openclawRegistry } from './registry.js';

const router = Router();

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const skillSchema = z.object({
  name: z.string().min(1),
  version: z.string().min(1),
  description: z.string().optional(),
});

const manifestSchema = z.object({
  schema_version: z.literal('openclaw-manifest-v1'),
  agent_name: z.string().min(1),
  agent_description: z.string().min(1),
  agent_role: z.string().min(1),
  skills: z.array(skillSchema),
});

// =============================================================================
// ROUTES
// =============================================================================

/**
 * POST /api/v1/openclaw/register
 *
 * Register a new Agent ID from manifest.
 *
 * Request body:
 * {
 *   manifest: OpenClawManifest,
 *   manifest_ref?: string  // Optional IPFS/URL reference
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     agent_id: OpenClawAgentId
 *   }
 * }
 */
router.post('/register', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { manifest, manifest_ref } = req.body;

    // Validate manifest
    const parseResult = manifestSchema.safeParse(manifest);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_MANIFEST',
          message: 'Invalid manifest format',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    // Register (idempotent - returns existing if already registered)
    const { agentId, created } = openclawRegistry.register(
      parseResult.data as OpenClawManifest,
      manifest_ref
    );

    res.status(created ? 201 : 200).json({
      success: true,
      data: {
        agent_id: agentId,
        created,  // true = new registration, false = already existed
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/openclaw/:fingerprint
 *
 * Get a registered Agent ID by fingerprint.
 */
router.get('/:fingerprint', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { fingerprint: fp } = req.params;

    if (!isValidFingerprint(fp)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FINGERPRINT',
          message: 'Invalid fingerprint format. Must be 0x followed by 64 hex characters.',
        },
      });
      return;
    }

    const agentId = openclawRegistry.get(fp);

    if (!agentId) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Agent ID not found',
        },
      });
      return;
    }

    res.json({
      success: true,
      data: {
        agent_id: agentId,
        exists: true,
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/openclaw/verify
 *
 * Verify a manifest against a registered fingerprint.
 *
 * Request body:
 * {
 *   manifest: OpenClawManifest,
 *   fingerprint: string
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     match: boolean,
 *     computed_fingerprint: string,
 *     registered_fingerprint: string,
 *     message: string
 *   }
 * }
 */
router.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { manifest, fingerprint: fp } = req.body;

    // Validate manifest
    const parseResult = manifestSchema.safeParse(manifest);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_MANIFEST',
          message: 'Invalid manifest format',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    if (!fp || !isValidFingerprint(fp)) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_FINGERPRINT',
          message: 'Invalid or missing fingerprint',
        },
      });
      return;
    }

    // Verify
    const result = verifyAgainstFingerprint(parseResult.data as OpenClawManifest, fp);

    res.json({
      success: true,
      data: result,
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/v1/openclaw/fingerprint
 *
 * Calculate fingerprint from manifest WITHOUT registering.
 *
 * Use this for local verification before registration.
 *
 * Request body:
 * {
 *   manifest: OpenClawManifest
 * }
 *
 * Response:
 * {
 *   success: true,
 *   data: {
 *     fingerprint: string,
 *     canonical: string  // The canonical JSON used
 *   }
 * }
 */
router.post('/fingerprint', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { manifest } = req.body;

    // Validate manifest
    const parseResult = manifestSchema.safeParse(manifest);
    if (!parseResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_MANIFEST',
          message: 'Invalid manifest format',
          details: parseResult.error.flatten(),
        },
      });
      return;
    }

    const typedManifest = parseResult.data as OpenClawManifest;
    const canonical = canonicalize(typedManifest);
    const fp = fingerprint(typedManifest);

    res.json({
      success: true,
      data: {
        fingerprint: fp,
        canonical: canonical,
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/v1/openclaw
 *
 * List registered Agent IDs.
 *
 * Query params:
 * - limit: number (default 100)
 * - offset: number (default 0)
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const limit = Math.min(parseInt(req.query.limit as string) || 100, 1000);
    const offset = parseInt(req.query.offset as string) || 0;

    const agentIds = openclawRegistry.list(limit, offset);
    const total = openclawRegistry.count();

    res.json({
      success: true,
      data: {
        agent_ids: agentIds,
        total,
        limit,
        offset,
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    next(error);
  }
});

export default router;
