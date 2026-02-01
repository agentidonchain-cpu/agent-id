/**
 * Agent007 - Main Server
 *
 * Entry point for the Agent007 API server.
 * License to Verify - Immutable Identity for AI Agents
 */

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import http from 'http';
import { logger } from './utils/logger.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import agentRoutes from './routes/agents.js';
import adminRoutes from './routes/admin.js';
import multiAgentRoutes from './routes/multi-agent.js';
import proxyRoutes from './routes/proxy.js';
import websocketRoutes from './routes/websocket.js';
import blockchainRoutes from './routes/blockchain.js';
import { initializeDatabase, shutdownDatabase, verifySchema } from './config/init-db.js';
import { getHealth as getDatabaseHealth, query } from './config/database.js';
import { getWebSocketService, resetWebSocketService } from './services/realtime/websocket.js';

// =============================================================================
// ENVIRONMENT SETUP
// =============================================================================

// Load environment variables (for development)
import dotenv from 'dotenv';
if (process.env.NODE_ENV !== 'production') {
  dotenv.config();
}

const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || '0.0.0.0';

// Set a default encryption key for development only
if (!process.env.ENCRYPTION_MASTER_KEY && process.env.NODE_ENV !== 'production') {
  // This is a development-only key - NEVER use in production
  process.env.ENCRYPTION_MASTER_KEY = 'a'.repeat(64);
  logger.warn('Using development encryption key - do not use in production');
}

// =============================================================================
// EXPRESS APP SETUP
// =============================================================================

const app = express();

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
}));

// CORS
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
  credentials: true,
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100'),
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests, please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration,
      userAgent: req.headers['user-agent'],
    }, 'Request completed');
  });

  next();
});

// =============================================================================
// ROUTES
// =============================================================================

// Health check
app.get('/health', async (_req, res) => {
  try {
    const dbHealth = await getDatabaseHealth();

    res.json({
      status: dbHealth.connected ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      database: {
        connected: dbHealth.connected,
        latencyMs: dbHealth.latencyMs,
        poolSize: dbHealth.poolSize,
        idleConnections: dbHealth.idleConnections,
      },
    });
  } catch (error) {
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '0.1.0',
      database: { connected: false },
    });
  }
});

// API info
app.get('/api/v1', (_req, res) => {
  res.json({
    name: 'Agent007 API',
    version: '1.0.0',
    description: 'License to Verify - Immutable identity verification for AI agents',
    documentation: '/docs',
    endpoints: {
      agents: {
        register: 'POST /api/v1/agents/register',
        validate: 'POST /api/v1/agents/validate',
        verify: 'GET /api/v1/agents/:identityHash/verify',
        list: 'GET /api/v1/agents',
        verification: 'POST /api/v1/agents/:identityHash/verification/schedule',
      },
      admin: {
        stats: 'GET /api/v1/admin/stats',
        agents: 'GET /api/v1/admin/agents',
        health: 'GET /api/v1/admin/health',
        audit: 'GET /api/v1/admin/audit',
      },
      multiAgent: {
        verify: 'POST /api/v1/multi-agent/verify',
        compare: 'POST /api/v1/multi-agent/compare',
        schedule: 'POST /api/v1/multi-agent/schedule',
        stats: 'GET /api/v1/multi-agent/stats',
      },
      proxy: {
        chat: 'POST /api/v1/proxy/chat',
        complete: 'POST /api/v1/proxy/complete',
        verifyAttestation: 'POST /api/v1/proxy/verify-attestation',
        verifyIntegrity: 'POST /api/v1/proxy/verify-integrity',
        logs: 'GET /api/v1/proxy/logs/:identityHash',
        stats: 'GET /api/v1/proxy/stats',
      },
      blockchain: {
        status: 'GET /api/v1/blockchain/status',
        anchor: 'POST /api/v1/blockchain/anchor/:identityHash',
        anchorBatch: 'POST /api/v1/blockchain/anchor-batch',
        verify: 'GET /api/v1/blockchain/verify/:identityHash',
        proof: 'GET /api/v1/blockchain/proof/:identityHash',
        revoke: 'POST /api/v1/blockchain/revoke/:identityHash',
        estimate: 'GET /api/v1/blockchain/estimate/:identityHash',
      },
    },
  });
});

// Agent routes
app.use('/api/v1/agents', agentRoutes);

// Admin routes
app.use('/api/v1/admin', adminRoutes);

// Multi-agent verification routes
app.use('/api/v1/multi-agent', multiAgentRoutes);

// LLM Proxy routes
app.use('/api/v1/proxy', proxyRoutes);

// WebSocket status routes
app.use('/api/v1/ws', websocketRoutes);

// Blockchain routes
app.use('/api/v1/blockchain', blockchainRoutes);

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use(notFoundHandler);

// Error handler
app.use(errorHandler);

// =============================================================================
// SERVER STARTUP
// =============================================================================

// Database connection status
let databaseConnected = false;

async function startServer() {
  // Initialize database connection (optional - works without DB)
  try {
    databaseConnected = await initializeDatabase();

    if (databaseConnected) {
      const schema = await verifySchema();
      if (!schema.valid) {
        logger.warn(
          { missingTables: schema.missingTables },
          'Database schema incomplete - run database/schema.sql to create tables'
        );
      }
    }
  } catch (error) {
    logger.warn({ error }, 'Database not available - running in memory-only mode');
  }

  // Create HTTP server and initialize WebSocket
  const server = http.createServer(app);
  const wsService = getWebSocketService();
  wsService.initialize(server);

  // Set up real-time stats callback for website
  if (databaseConnected) {
    wsService.setStatsCallback(async () => {
      try {
        const [totalResult, anchoredResult] = await Promise.all([
          query<{ count: string }>('SELECT COUNT(*) as count FROM agent_identities'),
          query<{ count: string }>('SELECT COUNT(*) as count FROM agent_identities WHERE blockchain_tx_hash IS NOT NULL'),
        ]);

        return {
          totalAgents: parseInt(totalResult.rows[0]?.count || '0'),
          totalAnchored: parseInt(anchoredResult.rows[0]?.count || '0'),
        };
      } catch (error) {
        logger.error({ error }, 'Failed to fetch stats for WebSocket');
        return { totalAgents: 0, totalAnchored: 0 };
      }
    });

    // Start broadcasting stats every 5 seconds
    wsService.startStatsInterval(5000);
  }

  server.listen(Number(PORT), HOST, () => {
    logger.info({
      port: PORT,
      host: HOST,
      env: process.env.NODE_ENV || 'development',
      database: databaseConnected ? 'connected' : 'offline',
      websocket: 'enabled',
      realtimeStats: databaseConnected ? 'enabled' : 'disabled',
    }, 'Agent007 server started');

    console.log(`
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║   🔫 AGENT007 - LICENSE TO VERIFY                                ║
║                                                                  ║
║   Immutable Identity Verification for AI Agents                  ║
║                                                                  ║
║   Server running at: http://${HOST}:${PORT}                         ║
║   API Base URL:      http://${HOST}:${PORT}/api/v1                  ║
║   WebSocket URL:     ws://${HOST}:${PORT}/ws                        ║
║   Database:          ${databaseConnected ? 'Connected     ' : 'Offline (in-memory)'}                       ║
║                                                                  ║
║   Agent Endpoints:                                               ║
║   • POST /api/v1/agents/register  - Register new agent           ║
║   • POST /api/v1/agents/validate  - Validate agent identity      ║
║   • GET  /api/v1/agents/:hash     - Get agent details            ║
║   • GET  /api/v1/agents/:hash/verify - Verify identity           ║
║                                                                  ║
║   Admin Endpoints:                                               ║
║   • GET  /api/v1/admin/stats      - System statistics            ║
║   • GET  /api/v1/admin/health     - Health check                 ║
║   • POST /api/v1/admin/bulk       - Bulk agent actions           ║
║                                                                  ║
║   Multi-Agent Endpoints:                                         ║
║   • POST /api/v1/multi-agent/verify  - Batch verification        ║
║   • POST /api/v1/multi-agent/compare - Compare agents            ║
║                                                                  ║
║   LLM Proxy Endpoints:                                           ║
║   • POST /api/v1/proxy/chat     - Proxied chat with attestation  ║
║   • POST /api/v1/proxy/complete - Proxied completion             ║
║   • POST /api/v1/proxy/verify-attestation - Verify attestation   ║
║                                                                  ║
║   Blockchain Endpoints (Base Mainnet):                           ║
║   • GET  /api/v1/blockchain/status   - Chain status              ║
║   • POST /api/v1/blockchain/anchor   - Anchor identity on-chain  ║
║   • GET  /api/v1/blockchain/verify   - Verify on-chain           ║
║   • GET  /api/v1/blockchain/proof    - Get blockchain proof      ║
║                                                                  ║
║   WebSocket Events:                                              ║
║   • agent.registered, agent.validated, agent.anchored            ║
║   • stats.update, visitor.count (real-time for website)          ║
║   • verification.completed, alert.created                        ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
    `);
  });

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Shutdown signal received');

    server.close(async () => {
      logger.info('HTTP server closed');

      // Shutdown WebSocket
      resetWebSocketService();

      // Shutdown database connection
      if (databaseConnected) {
        await shutdownDatabase();
      }

      process.exit(0);
    });

    // Force shutdown after 10 seconds
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

const server = startServer();

export default app;
