/**
 * Agent007 - Database Initialization
 *
 * Script to initialize and verify database connection.
 */

import { getPool, checkConnection, getHealth, closePool } from './database.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize database connection and verify connectivity
 */
export async function initializeDatabase(): Promise<boolean> {
  try {
    logger.info('Initializing database connection...');

    // Get pool to trigger lazy initialization
    const pool = getPool();

    // Check connection
    const connected = await checkConnection();

    if (!connected) {
      logger.error('Database connection check failed');
      return false;
    }

    // Get health status
    const health = await getHealth();

    logger.info(
      {
        connected: health.connected,
        latencyMs: health.latencyMs,
        poolSize: health.poolSize,
        idleConnections: health.idleConnections,
      },
      'Database connection established'
    );

    return true;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize database');
    return false;
  }
}

/**
 * Gracefully shutdown database connection
 */
export async function shutdownDatabase(): Promise<void> {
  try {
    logger.info('Shutting down database connection...');
    await closePool();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error({ error }, 'Error during database shutdown');
  }
}

/**
 * Check if required tables exist
 */
export async function verifySchema(): Promise<{
  valid: boolean;
  missingTables: string[];
}> {
  const requiredTables = [
    'creators',
    'agent_identities',
    'agent_core_configs',
    'agent_tools',
    'agent_metadata',
    'validation_challenges',
    'attestations',
    'behavioral_fingerprints',
    'autonomy_analyses',
    'verification_results',
    'alerts',
    'identity_violations',
    'audit_log',
    'proxy_logs',
  ];

  try {
    const pool = getPool();
    const result = await pool.query<{ table_name: string }>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = 'public'
         AND table_type = 'BASE TABLE'`
    );

    const existingTables = new Set(result.rows.map((r) => r.table_name));
    const missingTables = requiredTables.filter((t) => !existingTables.has(t));

    if (missingTables.length > 0) {
      logger.warn({ missingTables }, 'Missing database tables');
    }

    return {
      valid: missingTables.length === 0,
      missingTables,
    };
  } catch (error) {
    logger.error({ error }, 'Failed to verify schema');
    return {
      valid: false,
      missingTables: requiredTables,
    };
  }
}

// =============================================================================
// CLI RUNNER
// =============================================================================

// Run if executed directly
const isMainModule = process.argv[1]?.endsWith('init-db.ts') ||
                     process.argv[1]?.endsWith('init-db.js');

if (isMainModule) {
  (async () => {
    console.log('\n=== Agent007 Database Initialization ===\n');

    // Initialize connection
    const connected = await initializeDatabase();

    if (!connected) {
      console.error('Failed to connect to database');
      process.exit(1);
    }

    // Verify schema
    console.log('\nVerifying schema...');
    const schema = await verifySchema();

    if (schema.valid) {
      console.log('All required tables exist');
    } else {
      console.log('\nMissing tables:');
      schema.missingTables.forEach((t) => console.log(`  - ${t}`));
      console.log('\nRun the schema.sql script to create missing tables:');
      console.log('  psql -d agent007 -f database/schema.sql');
    }

    // Get health status
    const health = await getHealth();
    console.log('\nDatabase Health:');
    console.log(`  Connected: ${health.connected}`);
    console.log(`  Latency: ${health.latencyMs}ms`);
    console.log(`  Pool Size: ${health.poolSize}`);
    console.log(`  Idle Connections: ${health.idleConnections}`);
    console.log(`  Waiting Clients: ${health.waitingClients}`);

    // Shutdown
    await shutdownDatabase();
    console.log('\nDatabase initialization complete.\n');
    process.exit(schema.valid ? 0 : 1);
  })();
}
