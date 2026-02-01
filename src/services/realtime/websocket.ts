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

    logger.info({ clientId, clientIp }, 'WebSocket client connected');

    // Send welcome message
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
          'agent:{identityHash}', // Per-agent channel
        ],
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
