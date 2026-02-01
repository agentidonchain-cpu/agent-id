/**
 * Agent007 - WebSocket Status Routes
 *
 * API endpoints for WebSocket status and statistics.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { getWebSocketService } from '../services/realtime/websocket.js';

// =============================================================================
// ROUTER
// =============================================================================

const router = Router();

/**
 * GET /ws/status
 * Get WebSocket server status
 */
router.get(
  '/status',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const wsService = getWebSocketService();
      const stats = wsService.getStats();

      res.json({
        success: true,
        data: {
          status: 'active',
          connectedClients: stats.connectedClients,
          channels: stats.channels,
          uptime: Math.round(stats.uptime),
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
 * GET /ws/info
 * Get WebSocket connection info
 */
router.get(
  '/info',
  async (_req: Request, res: Response, next: NextFunction) => {
    try {
      res.json({
        success: true,
        data: {
          endpoint: '/ws',
          protocol: 'WebSocket',
          channels: {
            all: 'All events',
            alerts: 'Alert events only',
            verifications: 'Verification events only',
            system: 'System health and stats',
            'agent:{identityHash}': 'Events for a specific agent',
          },
          events: {
            connection: ['connected', 'subscribed', 'unsubscribed', 'error'],
            agent: ['agent.registered', 'agent.validated', 'agent.status_changed'],
            verification: ['verification.started', 'verification.completed', 'verification.failed'],
            alert: ['alert.created', 'alert.acknowledged'],
            proxy: ['proxy.request', 'proxy.response'],
            system: ['system.health', 'system.stats'],
          },
          actions: {
            subscribe: '{"action": "subscribe", "channel": "alerts"}',
            unsubscribe: '{"action": "unsubscribe", "channel": "alerts"}',
            subscribeAgent: '{"action": "subscribe", "identityHash": "abc123..."}',
            ping: '{"action": "ping"}',
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
