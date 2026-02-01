/**
 * Agent007 - Database Configuration
 *
 * PostgreSQL connection pool and query utilities.
 */

import pg from 'pg';
import { logger } from '../utils/logger.js';

const { Pool } = pg;

// =============================================================================
// CONFIGURATION
// =============================================================================

const databaseConfig = {
  connectionString: process.env.DATABASE_URL,
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'agent007',
  user: process.env.DB_USER || 'agent007',
  password: process.env.DB_PASSWORD || 'agent007_secret',
  max: parseInt(process.env.DB_POOL_SIZE || '20'),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
};

// Use connection string if provided, otherwise use individual params
const poolConfig = databaseConfig.connectionString
  ? { connectionString: databaseConfig.connectionString, max: databaseConfig.max }
  : databaseConfig;

// =============================================================================
// CONNECTION POOL
// =============================================================================

let pool: pg.Pool | null = null;

/**
 * Get database connection pool (lazy initialization)
 */
export function getPool(): pg.Pool {
  if (!pool) {
    pool = new Pool(poolConfig);

    pool.on('error', (err) => {
      logger.error({ err }, 'Unexpected database pool error');
    });

    pool.on('connect', () => {
      logger.debug('New database connection established');
    });
  }

  return pool;
}

/**
 * Execute a query
 */
export async function query<T extends pg.QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<pg.QueryResult<T>> {
  const start = Date.now();
  const result = await getPool().query<T>(text, params);
  const duration = Date.now() - start;

  logger.debug({
    query: text.slice(0, 100),
    duration,
    rows: result.rowCount,
  }, 'Database query executed');

  return result;
}

/**
 * Get a client from the pool for transactions
 */
export async function getClient(): Promise<pg.PoolClient> {
  return getPool().connect();
}

/**
 * Execute a transaction
 */
export async function transaction<T>(
  callback: (client: pg.PoolClient) => Promise<T>
): Promise<T> {
  const client = await getClient();

  try {
    await client.query('BEGIN');
    const result = await callback(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check database connectivity
 */
export async function checkConnection(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW()');
    return result.rowCount === 1;
  } catch (error) {
    logger.error({ error }, 'Database connection check failed');
    return false;
  }
}

/**
 * Close the pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
    logger.info('Database pool closed');
  }
}

// =============================================================================
// QUERY BUILDERS
// =============================================================================

/**
 * Build an INSERT query with RETURNING
 */
export function buildInsert(
  table: string,
  data: Record<string, any>,
  returning: string = '*'
): { text: string; values: any[] } {
  const keys = Object.keys(data);
  const values = Object.values(data);
  const placeholders = keys.map((_, i) => `$${i + 1}`);

  return {
    text: `INSERT INTO ${table} (${keys.join(', ')}) VALUES (${placeholders.join(', ')}) RETURNING ${returning}`,
    values,
  };
}

/**
 * Build an UPDATE query
 */
export function buildUpdate(
  table: string,
  data: Record<string, any>,
  where: Record<string, any>,
  returning: string = '*'
): { text: string; values: any[] } {
  const keys = Object.keys(data);
  const whereKeys = Object.keys(where);

  let paramIndex = 1;
  const setClauses = keys.map((key) => `${key} = $${paramIndex++}`);
  const whereClauses = whereKeys.map((key) => `${key} = $${paramIndex++}`);

  const values = [...Object.values(data), ...Object.values(where)];

  return {
    text: `UPDATE ${table} SET ${setClauses.join(', ')} WHERE ${whereClauses.join(' AND ')} RETURNING ${returning}`,
    values,
  };
}

// =============================================================================
// TYPES
// =============================================================================

export interface DatabaseHealth {
  connected: boolean;
  latencyMs: number;
  poolSize: number;
  idleConnections: number;
  waitingClients: number;
}

/**
 * Get database health status
 */
export async function getHealth(): Promise<DatabaseHealth> {
  const start = Date.now();
  const connected = await checkConnection();
  const latencyMs = Date.now() - start;

  const p = getPool();

  return {
    connected,
    latencyMs,
    poolSize: p.totalCount,
    idleConnections: p.idleCount,
    waitingClients: p.waitingCount,
  };
}
