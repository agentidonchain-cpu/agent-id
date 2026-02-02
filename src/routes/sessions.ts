/**
 * Sessions API
 * Manages signing sessions for browser-based wallet signing
 */

import { Router, Request, Response } from 'express';
import { randomBytes } from 'crypto';

const router = Router();

// In-memory session storage (use Redis in production)
interface SigningSession {
  sessionId: string;
  identityHash: string;
  identityType: 'config' | 'attestation';
  message: string;
  status: 'pending' | 'signed' | 'expired' | 'error';
  signature?: string;
  walletAddress?: string;
  timestamp?: string;
  createdAt: Date;
  expiresAt: Date;
}

const sessions = new Map<string, SigningSession>();

// Clean up expired sessions every minute
setInterval(() => {
  const now = new Date();
  for (const [id, session] of sessions) {
    if (session.expiresAt < now) {
      sessions.delete(id);
    }
  }
}, 60 * 1000);

/**
 * POST /api/v1/sessions
 * Create a new signing session
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { sessionId, identityHash, identityType, message } = req.body;

    if (!sessionId || !identityHash || !identityType || !message) {
      return res.status(400).json({
        error: 'Missing required fields: sessionId, identityHash, identityType, message',
      });
    }

    if (!['config', 'attestation'].includes(identityType)) {
      return res.status(400).json({
        error: 'identityType must be "config" or "attestation"',
      });
    }

    // Check if session already exists
    if (sessions.has(sessionId)) {
      return res.status(409).json({
        error: 'Session already exists',
      });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 5 * 60 * 1000); // 5 minutes

    const session: SigningSession = {
      sessionId,
      identityHash,
      identityType,
      message,
      status: 'pending',
      createdAt: now,
      expiresAt,
    };

    sessions.set(sessionId, session);

    return res.status(201).json({
      sessionId: session.sessionId,
      identityHash: session.identityHash,
      identityType: session.identityType,
      status: session.status,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error('Error creating session:', error);
    return res.status(500).json({
      error: 'Failed to create session',
    });
  }
});

/**
 * GET /api/v1/sessions/:sessionId
 * Get session status
 */
router.get('/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found or expired',
      });
    }

    // Check if expired
    if (session.expiresAt < new Date()) {
      session.status = 'expired';
      sessions.delete(sessionId);
      return res.status(410).json({
        error: 'Session expired',
      });
    }

    return res.json({
      sessionId: session.sessionId,
      identityHash: session.identityHash,
      identityType: session.identityType,
      message: session.message,
      status: session.status,
      signature: session.signature,
      walletAddress: session.walletAddress,
      timestamp: session.timestamp,
      createdAt: session.createdAt.toISOString(),
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error: any) {
    console.error('Error getting session:', error);
    return res.status(500).json({
      error: 'Failed to get session',
    });
  }
});

/**
 * POST /api/v1/sessions/:sessionId/signature
 * Submit a signature for a session (called from browser)
 */
router.post('/:sessionId/signature', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const { signature, walletAddress, timestamp } = req.body;

    if (!signature || !walletAddress) {
      return res.status(400).json({
        error: 'Missing required fields: signature, walletAddress',
      });
    }

    const session = sessions.get(sessionId);

    if (!session) {
      return res.status(404).json({
        error: 'Session not found or expired',
      });
    }

    // Check if expired
    if (session.expiresAt < new Date()) {
      session.status = 'expired';
      sessions.delete(sessionId);
      return res.status(410).json({
        error: 'Session expired',
      });
    }

    // Check if already signed
    if (session.status === 'signed') {
      return res.status(409).json({
        error: 'Session already signed',
      });
    }

    // Verify the signature
    try {
      const { verifyMessage } = await import('ethers');
      const recoveredAddress = verifyMessage(session.message, signature);

      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        return res.status(400).json({
          error: 'Signature verification failed: address mismatch',
        });
      }
    } catch (verifyError: any) {
      return res.status(400).json({
        error: 'Invalid signature: ' + verifyError.message,
      });
    }

    // Update session with signature
    session.signature = signature;
    session.walletAddress = walletAddress.toLowerCase();
    session.timestamp = timestamp || new Date().toISOString();
    session.status = 'signed';

    return res.json({
      success: true,
      sessionId: session.sessionId,
      status: session.status,
      walletAddress: session.walletAddress,
    });
  } catch (error: any) {
    console.error('Error submitting signature:', error);
    return res.status(500).json({
      error: 'Failed to submit signature',
    });
  }
});

/**
 * DELETE /api/v1/sessions/:sessionId
 * Delete a session (cleanup)
 */
router.delete('/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;

    if (sessions.has(sessionId)) {
      sessions.delete(sessionId);
      return res.json({ success: true });
    }

    return res.status(404).json({
      error: 'Session not found',
    });
  } catch (error: any) {
    console.error('Error deleting session:', error);
    return res.status(500).json({
      error: 'Failed to delete session',
    });
  }
});

export default router;
