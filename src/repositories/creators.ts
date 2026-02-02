/**
 * Agent007 - Creator Repository
 *
 * Database operations for creator accounts (agent owners).
 */

import { query, transaction } from '../config/database.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface CreatorRow {
  id: string;
  email: string;
  email_hash: string;
  display_name: string;
  wallet_address?: string;
  password_hash?: string;
  mfa_enabled: boolean;
  email_verified: boolean;
  email_verified_at?: Date;
  api_key_hash?: string;
  api_key_prefix?: string;
  api_key_created_at?: Date;
  is_active: boolean;
  suspended_at?: Date;
  suspended_reason?: string;
  created_at: Date;
  updated_at: Date;
  last_login_at?: Date;
}

export interface CreateCreatorInput {
  email: string;
  emailHash: string;
  displayName: string;
  passwordHash?: string;
  walletAddress?: string;
}

// =============================================================================
// CREATOR REPOSITORY
// =============================================================================

export class CreatorRepository {
  // ===========================================================================
  // CREATE OPERATIONS
  // ===========================================================================

  /**
   * Create a new creator
   */
  async create(input: CreateCreatorInput): Promise<CreatorRow> {
    const result = await query<CreatorRow>(
      `INSERT INTO creators (
        email, email_hash, display_name, password_hash, wallet_address
      ) VALUES ($1, $2, $3, $4, $5)
      RETURNING *`,
      [
        input.email,
        input.emailHash,
        input.displayName,
        input.passwordHash || null,
        input.walletAddress || null,
      ]
    );

    logger.info({ email: input.email }, 'Creator account created');
    return result.rows[0];
  }

  // ===========================================================================
  // READ OPERATIONS
  // ===========================================================================

  /**
   * Find creator by ID
   */
  async findById(id: string): Promise<CreatorRow | null> {
    const result = await query<CreatorRow>(
      'SELECT * FROM creators WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Find creator by email
   */
  async findByEmail(email: string): Promise<CreatorRow | null> {
    const result = await query<CreatorRow>(
      'SELECT * FROM creators WHERE email = $1',
      [email]
    );
    return result.rows[0] || null;
  }

  /**
   * Find creator by email hash
   */
  async findByEmailHash(emailHash: string): Promise<CreatorRow | null> {
    const result = await query<CreatorRow>(
      'SELECT * FROM creators WHERE email_hash = $1',
      [emailHash]
    );
    return result.rows[0] || null;
  }

  /**
   * Find creator by API key prefix
   */
  async findByApiKeyPrefix(prefix: string): Promise<CreatorRow | null> {
    const result = await query<CreatorRow>(
      'SELECT * FROM creators WHERE api_key_prefix = $1 AND is_active = TRUE',
      [prefix]
    );
    return result.rows[0] || null;
  }

  /**
   * Find creator by API key hash (for authentication)
   */
  async findByApiKeyHash(apiKeyHash: string): Promise<CreatorRow | null> {
    const result = await query<CreatorRow>(
      'SELECT * FROM creators WHERE api_key_hash = $1 AND is_active = TRUE',
      [apiKeyHash]
    );
    return result.rows[0] || null;
  }

  /**
   * Find creator by wallet address
   */
  async findByWallet(walletAddress: string): Promise<CreatorRow | null> {
    const result = await query<CreatorRow>(
      'SELECT * FROM creators WHERE wallet_address = $1',
      [walletAddress]
    );
    return result.rows[0] || null;
  }

  /**
   * Check if email exists
   */
  async emailExists(email: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM creators WHERE email = $1) as exists',
      [email]
    );
    return result.rows[0].exists;
  }

  /**
   * List creators with pagination
   */
  async list(options: {
    page?: number;
    pageSize?: number;
    activeOnly?: boolean;
  } = {}): Promise<{ creators: CreatorRow[]; total: number }> {
    const { page = 1, pageSize = 20, activeOnly = false } = options;
    const offset = (page - 1) * pageSize;

    const whereClause = activeOnly ? 'WHERE is_active = TRUE' : '';

    const [countResult, listResult] = await Promise.all([
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM creators ${whereClause}`
      ),
      query<CreatorRow>(
        `SELECT * FROM creators ${whereClause}
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [pageSize, offset]
      ),
    ]);

    return {
      creators: listResult.rows,
      total: parseInt(countResult.rows[0].count),
    };
  }

  // ===========================================================================
  // UPDATE OPERATIONS
  // ===========================================================================

  /**
   * Set API key for creator
   */
  async setApiKey(
    id: string,
    apiKeyHash: string,
    apiKeyPrefix: string
  ): Promise<boolean> {
    const result = await query(
      `UPDATE creators
       SET api_key_hash = $1, api_key_prefix = $2, api_key_created_at = NOW(), updated_at = NOW()
       WHERE id = $3`,
      [apiKeyHash, apiKeyPrefix, id]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Verify email
   */
  async verifyEmail(id: string): Promise<boolean> {
    const result = await query(
      `UPDATE creators
       SET email_verified = TRUE, email_verified_at = NOW(), updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Update password
   */
  async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    const result = await query(
      `UPDATE creators
       SET password_hash = $1, updated_at = NOW()
       WHERE id = $2`,
      [passwordHash, id]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Enable MFA
   */
  async enableMfa(id: string, mfaSecretEncrypted: Buffer): Promise<boolean> {
    const result = await query(
      `UPDATE creators
       SET mfa_enabled = TRUE, mfa_secret_encrypted = $1, updated_at = NOW()
       WHERE id = $2`,
      [mfaSecretEncrypted, id]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Disable MFA
   */
  async disableMfa(id: string): Promise<boolean> {
    const result = await query(
      `UPDATE creators
       SET mfa_enabled = FALSE, mfa_secret_encrypted = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Suspend creator
   */
  async suspend(id: string, reason: string): Promise<boolean> {
    const result = await query(
      `UPDATE creators
       SET is_active = FALSE, suspended_at = NOW(), suspended_reason = $1, updated_at = NOW()
       WHERE id = $2`,
      [reason, id]
    );

    if ((result.rowCount || 0) > 0) {
      logger.warn({ creatorId: id, reason }, 'Creator account suspended');
    }

    return (result.rowCount || 0) > 0;
  }

  /**
   * Reactivate creator
   */
  async reactivate(id: string): Promise<boolean> {
    const result = await query(
      `UPDATE creators
       SET is_active = TRUE, suspended_at = NULL, suspended_reason = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    if ((result.rowCount || 0) > 0) {
      logger.info({ creatorId: id }, 'Creator account reactivated');
    }

    return (result.rowCount || 0) > 0;
  }

  /**
   * Update last login
   */
  async updateLastLogin(id: string): Promise<void> {
    await query(
      'UPDATE creators SET last_login_at = NOW() WHERE id = $1',
      [id]
    );
  }

  /**
   * Update display name
   */
  async updateDisplayName(id: string, displayName: string): Promise<boolean> {
    const result = await query(
      `UPDATE creators
       SET display_name = $1, updated_at = NOW()
       WHERE id = $2`,
      [displayName, id]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Update wallet address
   */
  async updateWallet(id: string, walletAddress: string | null): Promise<boolean> {
    const result = await query(
      `UPDATE creators
       SET wallet_address = $1, updated_at = NOW()
       WHERE id = $2`,
      [walletAddress, id]
    );

    return (result.rowCount || 0) > 0;
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(id: string): Promise<boolean> {
    const result = await query(
      `UPDATE creators
       SET api_key_hash = NULL, api_key_prefix = NULL, api_key_created_at = NULL, updated_at = NOW()
       WHERE id = $1`,
      [id]
    );

    return (result.rowCount || 0) > 0;
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get creator statistics
   */
  async getStats(): Promise<{
    total: number;
    active: number;
    verified: number;
    withMfa: number;
    withWallet: number;
  }> {
    const result = await query<{
      total: string;
      active: string;
      verified: string;
      with_mfa: string;
      with_wallet: string;
    }>(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_active = TRUE) as active,
        COUNT(*) FILTER (WHERE email_verified = TRUE) as verified,
        COUNT(*) FILTER (WHERE mfa_enabled = TRUE) as with_mfa,
        COUNT(*) FILTER (WHERE wallet_address IS NOT NULL) as with_wallet
       FROM creators`
    );

    const row = result.rows[0];
    return {
      total: parseInt(row.total),
      active: parseInt(row.active),
      verified: parseInt(row.verified),
      withMfa: parseInt(row.with_mfa),
      withWallet: parseInt(row.with_wallet),
    };
  }

  /**
   * Get agent count for creator
   */
  async getAgentCount(id: string): Promise<number> {
    const result = await query<{ count: string }>(
      'SELECT COUNT(*) as count FROM agent_identities WHERE creator_id = $1',
      [id]
    );
    return parseInt(result.rows[0].count);
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let creatorRepositoryInstance: CreatorRepository | null = null;

export function getCreatorRepository(): CreatorRepository {
  if (!creatorRepositoryInstance) {
    creatorRepositoryInstance = new CreatorRepository();
  }
  return creatorRepositoryInstance;
}
