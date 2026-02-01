/**
 * Agent007 - WebSocket Real-Time Service
 *
 * Provides real-time notifications for verification events, alerts, and status changes.
 */

import { WebSocketServer, WebSocket } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import http from 'http';
import { logger } from '../../utils/logger.js';
import {
  AlertSeverity,
  IdentityStatus,
  type VerificationResult,
  type VerificationAlert,
} from '../../types/identity.js';

// =============================================================================
// TYPES
// =============================================================================

export enum EventType {
  // Connection events
  CONNECTED = 'connected',
  SUBSCRIBED = 'subscribed',
  UNSUBSCRIBED = 'unsubscribed',
  ERROR = 'error',

  // Agent events
  AGENT_REGISTERED = 'agent.registered',
  AGENT_VALIDATED = 'agent.validated',
  AGENT_ANCHORED = 'agent.anchored',
  AGENT_STATUS_CHANGED = 'agent.status_changed',

  // Verification events
  VERIFICATION_STARTED = 'verification.started',
  VERIFICATION_COMPLETED = 'verification.completed',
  VERIFICATION_FAILED = 'verification.failed',

  // Alert events
  ALERT_CREATED = 'alert.created',
  ALERT_ACKNOWLEDGED = 'alert.acknowledged',

  // Proxy events
  PROXY_REQUEST = 'proxy.request',
  PROXY_RESPONSE = 'proxy.response',

  // System events
  SYSTEM_HEALTH = 'system.health',
  SYSTEM_STATS = 'system.stats',

  // Public stats events (for website)
  STATS_UPDATE = 'stats.update',
  VISITOR_COUNT = 'visitor.count',
}

export interface WebSocketMessage {
  type: EventType;
  timestamp: string;
  data: any;
  meta?: {
    identityHash?: string;
    requestId?: string;
    severity?: AlertSeverity;
  };
}

interface ClientInfo {
  id: string;
  ws: WebSocket;
  subscriptions: Set<string>;
  connectedAt: Date;
  lastPing: Date;
}

// =============================================================================
// WEBSOCKET SERVICE
// =============================================================================

export class WebSocketService {
  private wss: WebSocketServer | null = null;
  private clients = new Map<string, ClientInfo>();
  private pingInterval: NodeJS.Timeout | null = null;

  // Subscription channels
  private readonly CHANNEL_ALL = 'all';
  private readonly CHANNEL_ALERTS = 'alerts';
  private readonly CHANNEL_VERIFICATIONS = 'verifications';
  private readonly CHANNEL_SYSTEM = 'system';
  private readonly CHANNEL_STATS = 'stats';  // Public stats for website
  private readonly CHANNEL_VISITORS = 'visitors';  // Visitor count

  // Stats tracking
  private statsInterval: NodeJS.Timeout | null = null;
  private lastStats: { totalAgents: number; totalAnchored: number } = { totalAgents: 0, totalAnchored: 0 };
  private statsCallback: (() => Promise<{ totalAgents: number; totalAnchored: number }>) | null = null;

  // Visitor tracking
  private totalVisitors: number = 0;
  private peakVisitors: number = 0;

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Initialize WebSocket server
   */
  initialize(server: http.Server): void {
    this.wss = new WebSocketServer({
      server,
      path: '/ws',
    });

    this.wss.on('connection', (ws, req) => {
      this.handleConnection(ws, req);
    });

    // Start ping interval to keep connections alive
    this.pingInterval = setInterval(() => {
      this.pingClients();
    }, 30000);

    logger.info('WebSocket server initialized on /ws');
  }

  /**
   * Handle new WebSocket connection
   */
  private handleConnection(ws: WebSocket, req: http.IncomingMessage): void {
    const clientId = uuidv4();
    const clientIp = req.socket.remoteAddress;

    const client: ClientInfo = {
      id: clientId,
      ws,
      subscriptions: new Set([this.CHANNEL_ALL]),
      connectedAt: new Date(),
      lastPing: new Date(),
    };

    this.clients.set(clientId, client);
    this.totalVisitors++;

    logger.info({ clientId, clientIp }, 'WebSocket client connected');

    // Emit visitor count update
    this.emitVisitorCount();

    // Send welcome message with current stats
    this.sendToClient(client, {
      type: EventType.CONNECTED,
      timestamp: new Date().toISOString(),
      data: {
        clientId,
        channels: Array.from(client.subscriptions),
        availableChannels: [
          this.CHANNEL_ALL,
          this.CHANNEL_ALERTS,
          this.CHANNEL_VERIFICATIONS,
          this.CHANNEL_SYSTEM,
          this.CHANNEL_STATS,      // Public stats for website
          this.CHANNEL_VISITORS,   // Visitor count
          'agent:{identityHash}',  // Per-agent channel
        ],
        currentStats: this.lastStats,
        visitors: {
          current: this.getVisitorCount(),
          peak: this.peakVisitors,
        },
      },
    });

    // Handle incoming messages
    ws.on('message', (data) => {
      try {
        const message = JSON.parse(data.toString());
        this.handleMessage(client, message);
      } catch (error) {
        this.sendToClient(client, {
          type: EventType.ERROR,
          timestamp: new Date().toISOString(),
          data: { error: 'Invalid message format' },
        });
      }
    });

    // Handle pong responses
    ws.on('pong', () => {
      client.lastPing = new Date();
    });

    // Handle close
    ws.on('close', () => {
      this.clients.delete(clientId);
      logger.info({ clientId }, 'WebSocket client disconnected');

      // Emit visitor count update
      this.emitVisitorCount();
    });

    // Handle errors
    ws.on('error', (error) => {
      logger.error({ clientId, error }, 'WebSocket client error');
      this.clients.delete(clientId);
    });
  }

  /**
   * Handle incoming message from client
   */
  private handleMessage(client: ClientInfo, message: any): void {
    const { action, channel, identityHash } = message;

    switch (action) {
      case 'subscribe':
        this.subscribeClient(client, channel || identityHash);
        break;

      case 'unsubscribe':
        this.unsubscribeClient(client, channel || identityHash);
        break;

      case 'ping':
        this.sendToClient(client, {
          type: EventType.CONNECTED,
          timestamp: new Date().toISOString(),
          data: { pong: true },
        });
        break;

      default:
        this.sendToClient(client, {
          type: EventType.ERROR,
          timestamp: new Date().toISOString(),
          data: { error: `Unknown action: ${action}` },
        });
    }
  }

  /**
   * Subscribe client to a channel
   */
  private subscribeClient(client: ClientInfo, channel: string): void {
    client.subscriptions.add(channel);

    this.sendToClient(client, {
      type: EventType.SUBSCRIBED,
      timestamp: new Date().toISOString(),
      data: {
        channel,
        subscriptions: Array.from(client.subscriptions),
      },
    });

    // Send current stats immediately when subscribing to stats channel
    if (channel === this.CHANNEL_STATS) {
      this.sendToClient(client, {
        type: EventType.STATS_UPDATE,
        timestamp: new Date().toISOString(),
        data: {
          totalAgents: this.lastStats.totalAgents,
          totalAnchored: this.lastStats.totalAnchored,
          lastUpdated: new Date().toISOString(),
        },
      });
    }

    // Send current visitor count when subscribing to visitors channel
    if (channel === this.CHANNEL_VISITORS) {
      this.sendToClient(client, {
        type: EventType.VISITOR_COUNT,
        timestamp: new Date().toISOString(),
        data: {
          current: this.getVisitorCount(),
          peak: this.peakVisitors,
          total: this.totalVisitors,
        },
      });
    }

    // Update visitor count (subscription to stats/visitors affects count)
    if (channel === this.CHANNEL_STATS || channel === this.CHANNEL_VISITORS) {
      this.emitVisitorCount();
    }

    logger.debug({ clientId: client.id, channel }, 'Client subscribed to channel');
  }

  /**
   * Unsubscribe client from a channel
   */
  private unsubscribeClient(client: ClientInfo, channel: string): void {
    client.subscriptions.delete(channel);

    this.sendToClient(client, {
      type: EventType.UNSUBSCRIBED,
      timestamp: new Date().toISOString(),
      data: {
        channel,
        subscriptions: Array.from(client.subscriptions),
      },
    });

    // Update visitor count when unsubscribing from stats/visitors
    if (channel === this.CHANNEL_STATS || channel === this.CHANNEL_VISITORS) {
      this.emitVisitorCount();
    }

    logger.debug({ clientId: client.id, channel }, 'Client unsubscribed from channel');
  }

  /**
   * Ping all clients to keep connections alive
   */
  private pingClients(): void {
    const now = Date.now();
    const timeout = 60000; // 1 minute timeout

    for (const [clientId, client] of this.clients) {
      // Check if client has timed out
      if (now - client.lastPing.getTime() > timeout) {
        logger.warn({ clientId }, 'Client timed out, disconnecting');
        client.ws.terminate();
        this.clients.delete(clientId);
        continue;
      }

      // Send ping
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }
  }

  // ===========================================================================
  // BROADCAST METHODS
  // ===========================================================================

  /**
   * Send message to a specific client
   */
  private sendToClient(client: ClientInfo, message: WebSocketMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  /**
   * Broadcast to all clients subscribed to a channel
   */
  private broadcast(channel: string, message: WebSocketMessage): void {
    for (const client of this.clients.values()) {
      if (
        client.subscriptions.has(channel) ||
        client.subscriptions.has(this.CHANNEL_ALL)
      ) {
        this.sendToClient(client, message);
      }
    }
  }

  /**
   * Broadcast to clients subscribed to a specific agent
   */
  private broadcastToAgent(identityHash: string, message: WebSocketMessage): void {
    const agentChannel = `agent:${identityHash}`;

    for (const client of this.clients.values()) {
      if (
        client.subscriptions.has(agentChannel) ||
        client.subscriptions.has(this.CHANNEL_ALL)
      ) {
        this.sendToClient(client, message);
      }
    }
  }

  // ===========================================================================
  // EVENT EMITTERS
  // ===========================================================================

  /**
   * Emit agent registered event
   */
  emitAgentRegistered(data: {
    identityHash: string;
    displayName: string;
    provider: string;
    modelId: string;
  }): void {
    const message: WebSocketMessage = {
      type: EventType.AGENT_REGISTERED,
      timestamp: new Date().toISOString(),
      data,
      meta: { identityHash: data.identityHash },
    };

    this.broadcast(this.CHANNEL_ALL, message);
    this.broadcastToAgent(data.identityHash, message);
  }

  /**
   * Emit agent validated event
   */
  emitAgentValidated(data: {
    identityHash: string;
    displayName: string;
    score: number;
  }): void {
    const message: WebSocketMessage = {
      type: EventType.AGENT_VALIDATED,
      timestamp: new Date().toISOString(),
      data,
      meta: { identityHash: data.identityHash },
    };

    this.broadcast(this.CHANNEL_ALL, message);
    this.broadcastToAgent(data.identityHash, message);
  }

  /**
   * Emit agent status changed event
   */
  emitAgentStatusChanged(data: {
    identityHash: string;
    previousStatus: IdentityStatus;
    newStatus: IdentityStatus;
    reason?: string;
  }): void {
    const message: WebSocketMessage = {
      type: EventType.AGENT_STATUS_CHANGED,
      timestamp: new Date().toISOString(),
      data,
      meta: { identityHash: data.identityHash },
    };

    this.broadcast(this.CHANNEL_ALL, message);
    this.broadcastToAgent(data.identityHash, message);
  }

  /**
   * Emit verification started event
   */
  emitVerificationStarted(data: {
    identityHash: string;
    verificationId: string;
    checks: string[];
  }): void {
    const message: WebSocketMessage = {
      type: EventType.VERIFICATION_STARTED,
      timestamp: new Date().toISOString(),
      data,
      meta: { identityHash: data.identityHash },
    };

    this.broadcast(this.CHANNEL_VERIFICATIONS, message);
    this.broadcastToAgent(data.identityHash, message);
  }

  /**
   * Emit verification completed event
   */
  emitVerificationCompleted(data: {
    identityHash: string;
    result: VerificationResult;
  }): void {
    const message: WebSocketMessage = {
      type: EventType.VERIFICATION_COMPLETED,
      timestamp: new Date().toISOString(),
      data: {
        identityHash: data.identityHash,
        passed: data.result.passed,
        overallScore: data.result.overallScore,
        checksCount: data.result.checks.length,
        alertsCount: data.result.alerts.length,
        durationMs: data.result.durationMs,
      },
      meta: { identityHash: data.identityHash },
    };

    this.broadcast(this.CHANNEL_VERIFICATIONS, message);
    this.broadcastToAgent(data.identityHash, message);
  }

  /**
   * Emit verification failed event
   */
  emitVerificationFailed(data: {
    identityHash: string;
    error: string;
  }): void {
    const message: WebSocketMessage = {
      type: EventType.VERIFICATION_FAILED,
      timestamp: new Date().toISOString(),
      data,
      meta: { identityHash: data.identityHash },
    };

    this.broadcast(this.CHANNEL_VERIFICATIONS, message);
    this.broadcastToAgent(data.identityHash, message);
  }

  /**
   * Emit alert created event
   */
  emitAlertCreated(data: {
    identityHash: string;
    alert: VerificationAlert;
  }): void {
    const message: WebSocketMessage = {
      type: EventType.ALERT_CREATED,
      timestamp: new Date().toISOString(),
      data: {
        identityHash: data.identityHash,
        alertId: data.alert.id,
        severity: data.alert.severity,
        title: data.alert.title,
        message: data.alert.message,
      },
      meta: {
        identityHash: data.identityHash,
        severity: data.alert.severity,
      },
    };

    this.broadcast(this.CHANNEL_ALERTS, message);
    this.broadcastToAgent(data.identityHash, message);
  }

  /**
   * Emit alert acknowledged event
   */
  emitAlertAcknowledged(data: {
    identityHash: string;
    alertId: string;
    acknowledgedBy: string;
  }): void {
    const message: WebSocketMessage = {
      type: EventType.ALERT_ACKNOWLEDGED,
      timestamp: new Date().toISOString(),
      data,
      meta: { identityHash: data.identityHash },
    };

    this.broadcast(this.CHANNEL_ALERTS, message);
    this.broadcastToAgent(data.identityHash, message);
  }

  /**
   * Emit proxy request event
   */
  emitProxyRequest(data: {
    identityHash: string;
    requestId: string;
    provider: string;
    modelId: string;
  }): void {
    const message: WebSocketMessage = {
      type: EventType.PROXY_REQUEST,
      timestamp: new Date().toISOString(),
      data,
      meta: {
        identityHash: data.identityHash,
        requestId: data.requestId,
      },
    };

    this.broadcastToAgent(data.identityHash, message);
  }

  /**
   * Emit proxy response event
   */
  emitProxyResponse(data: {
    identityHash: string;
    requestId: string;
    latencyMs: number;
    tokensUsed: number;
    hasAttestation: boolean;
  }): void {
    const message: WebSocketMessage = {
      type: EventType.PROXY_RESPONSE,
      timestamp: new Date().toISOString(),
      data,
      meta: {
        identityHash: data.identityHash,
        requestId: data.requestId,
      },
    };

    this.broadcastToAgent(data.identityHash, message);
  }

  /**
   * Emit system health event
   */
  emitSystemHealth(data: {
    status: 'healthy' | 'degraded' | 'unhealthy';
    database: boolean;
    uptime: number;
    activeConnections: number;
  }): void {
    const message: WebSocketMessage = {
      type: EventType.SYSTEM_HEALTH,
      timestamp: new Date().toISOString(),
      data,
    };

    this.broadcast(this.CHANNEL_SYSTEM, message);
  }

  /**
   * Emit system stats event
   */
  emitSystemStats(data: {
    totalAgents: number;
    activeVerifications: number;
    alertsCount: number;
    proxyRequests: number;
  }): void {
    const message: WebSocketMessage = {
      type: EventType.SYSTEM_STATS,
      timestamp: new Date().toISOString(),
      data,
    };

    this.broadcast(this.CHANNEL_SYSTEM, message);
  }

  // ===========================================================================
  // PUBLIC STATS (WEBSITE)
  // ===========================================================================

  /**
   * Set callback to fetch stats from database
   */
  setStatsCallback(callback: () => Promise<{ totalAgents: number; totalAnchored: number }>): void {
    this.statsCallback = callback;
  }

  /**
   * Start broadcasting stats at regular interval
   */
  startStatsInterval(intervalMs: number = 5000): void {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }

    this.statsInterval = setInterval(async () => {
      await this.broadcastStats();
    }, intervalMs);

    // Broadcast immediately
    this.broadcastStats();

    logger.info({ intervalMs }, 'Stats broadcast interval started');
  }

  /**
   * Broadcast current stats to all subscribers
   */
  private async broadcastStats(): Promise<void> {
    if (!this.statsCallback) {
      return;
    }

    try {
      const stats = await this.statsCallback();

      // Only broadcast if stats changed
      if (
        stats.totalAgents !== this.lastStats.totalAgents ||
        stats.totalAnchored !== this.lastStats.totalAnchored
      ) {
        this.lastStats = stats;

        const message: WebSocketMessage = {
          type: EventType.STATS_UPDATE,
          timestamp: new Date().toISOString(),
          data: {
            totalAgents: stats.totalAgents,
            totalAnchored: stats.totalAnchored,
            lastUpdated: new Date().toISOString(),
          },
        };

        this.broadcast(this.CHANNEL_STATS, message);

        logger.debug({ stats }, 'Stats broadcast');
      }
    } catch (error) {
      logger.error({ error }, 'Failed to broadcast stats');
    }
  }

  /**
   * Emit stats update immediately (call after new agent registered)
   */
  async emitStatsUpdate(): Promise<void> {
    await this.broadcastStats();
  }

  /**
   * Emit agent anchored event (triggers stats update)
   */
  emitAgentAnchored(data: {
    identityHash: string;
    agentId?: string;
    displayName: string;
    anchoredAt: string;
    txHash?: string;
  }): void {
    const message: WebSocketMessage = {
      type: EventType.AGENT_ANCHORED,
      timestamp: new Date().toISOString(),
      data,
      meta: { identityHash: data.identityHash },
    };

    this.broadcast(this.CHANNEL_ALL, message);
    this.broadcast(this.CHANNEL_STATS, message);
    this.broadcastToAgent(data.identityHash, message);

    // Trigger immediate stats update
    this.broadcastStats();
  }

  /**
   * Get current visitor count (clients subscribed to stats channel)
   */
  getVisitorCount(): number {
    let count = 0;
    for (const client of this.clients.values()) {
      if (client.subscriptions.has(this.CHANNEL_STATS) || client.subscriptions.has(this.CHANNEL_VISITORS)) {
        count++;
      }
    }
    return count;
  }

  /**
   * Emit visitor count update
   */
  emitVisitorCount(): void {
    const currentVisitors = this.getVisitorCount();

    if (currentVisitors > this.peakVisitors) {
      this.peakVisitors = currentVisitors;
    }

    const message: WebSocketMessage = {
      type: EventType.VISITOR_COUNT,
      timestamp: new Date().toISOString(),
      data: {
        current: currentVisitors,
        peak: this.peakVisitors,
        total: this.totalVisitors,
      },
    };

    this.broadcast(this.CHANNEL_VISITORS, message);
  }

  // ===========================================================================
  // STATUS METHODS
  // ===========================================================================

  /**
   * Get connected clients count
   */
  getClientCount(): number {
    return this.clients.size;
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    connectedClients: number;
    channels: Record<string, number>;
    uptime: number;
    visitors: {
      current: number;
      peak: number;
      total: number;
    };
    lastAgentStats: { totalAgents: number; totalAnchored: number };
  } {
    const channels: Record<string, number> = {};

    for (const client of this.clients.values()) {
      for (const channel of client.subscriptions) {
        channels[channel] = (channels[channel] || 0) + 1;
      }
    }

    return {
      connectedClients: this.clients.size,
      channels,
      uptime: process.uptime(),
      visitors: {
        current: this.getVisitorCount(),
        peak: this.peakVisitors,
        total: this.totalVisitors,
      },
      lastAgentStats: this.lastStats,
    };
  }

  /**
   * Shutdown WebSocket server
   */
  shutdown(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }

    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }

    if (this.wss) {
      // Close all client connections
      for (const client of this.clients.values()) {
        client.ws.close(1000, 'Server shutting down');
      }

      this.clients.clear();
      this.wss.close();
      this.wss = null;

      logger.info('WebSocket server shut down');
    }
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let wsServiceInstance: WebSocketService | null = null;

export function getWebSocketService(): WebSocketService {
  if (!wsServiceInstance) {
    wsServiceInstance = new WebSocketService();
  }
  return wsServiceInstance;
}

export function resetWebSocketService(): void {
  if (wsServiceInstance) {
    wsServiceInstance.shutdown();
  }
  wsServiceInstance = null;
}
