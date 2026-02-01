/**
 * Agent007 - Attestations Repository
 *
 * Database operations for attestations and proxy logs.
 */

import { query, transaction } from '../config/database.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export type AttestationType =
  | 'provider_native'
  | 'proxy_verified'
  | 'self_declared'
  | 'behavioral'
  | 'identity_validation';

export type TrustLevel = 'high' | 'medium' | 'low';

export interface AttestationRow {
  id: string;
  attestation_id: string;
  agent_id: string;
  type: AttestationType;
  trust_level: TrustLevel;
  payload: Record<string, any>;
  signature: Buffer;
  signature_algorithm: string;
  issuer_name: string;
  issuer_public_key: string;
  issued_at: Date;
  valid_until: Date;
  revoked_at?: Date;
  revocation_reason?: string;
  nonce: string;
  request_id?: string;
}

export interface ProxyLogRow {
  id: string;
  request_id: string;
  agent_id?: string;
  request_received_at: number;
  request_forwarded_at: number;
  response_received_at: number;
  response_sent_at: number;
  original_request_hash: string;
  forwarded_request_hash: string;
  received_response_hash: string;
  sent_response_hash: string;
  model_provider?: string;
  model_id?: string;
  tokens_input?: number;
  tokens_output?: number;
  attestation_id?: string;
  created_at: Date;
}

export interface CreateAttestationInput {
  attestationId: string;
  agentId: string;
  type: AttestationType;
  trustLevel: TrustLevel;
  payload: Record<string, any>;
  signature: Buffer;
  signatureAlgorithm?: string;
  issuerName: string;
  issuerPublicKey: string;
  validUntil: Date;
  nonce: string;
  requestId?: string;
}

export interface CreateProxyLogInput {
  requestId: string;
  agentId?: string;
  requestReceivedAt: number;
  requestForwardedAt: number;
  responseReceivedAt: number;
  responseSentAt: number;
  originalRequestHash: string;
  forwardedRequestHash: string;
  receivedResponseHash: string;
  sentResponseHash: string;
  modelProvider?: string;
  modelId?: string;
  tokensInput?: number;
  tokensOutput?: number;
  attestationId?: string;
}

// =============================================================================
// ATTESTATION REPOSITORY
// =============================================================================

export class AttestationRepository {
  // ===========================================================================
  // ATTESTATION OPERATIONS
  // ===========================================================================

  /**
   * Create an attestation
   */
  async createAttestation(input: CreateAttestationInput): Promise<AttestationRow> {
    const result = await query<AttestationRow>(
      `INSERT INTO attestations (
        attestation_id, agent_id, type, trust_level, payload, signature,
        signature_algorithm, issuer_name, issuer_public_key, valid_until, nonce, request_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        input.attestationId,
        input.agentId,
        input.type,
        input.trustLevel,
        JSON.stringify(input.payload),
        input.signature,
        input.signatureAlgorithm || 'ed25519',
        input.issuerName,
        input.issuerPublicKey,
        input.validUntil,
        input.nonce,
        input.requestId || null,
      ]
    );

    logger.info(
      { attestationId: input.attestationId, type: input.type },
      'Attestation created'
    );

    return result.rows[0];
  }

  /**
   * Find attestation by ID
   */
  async findById(id: string): Promise<AttestationRow | null> {
    const result = await query<AttestationRow>(
      'SELECT * FROM attestations WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Find attestation by attestation ID
   */
  async findByAttestationId(attestationId: string): Promise<AttestationRow | null> {
    const result = await query<AttestationRow>(
      'SELECT * FROM attestations WHERE attestation_id = $1',
      [attestationId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get attestations for an agent
   */
  async getForAgent(
    agentId: string,
    options: {
      type?: AttestationType;
      validOnly?: boolean;
      limit?: number;
    } = {}
  ): Promise<AttestationRow[]> {
    const { type, validOnly = false, limit = 100 } = options;

    const conditions: string[] = ['agent_id = $1'];
    const params: any[] = [agentId];
    let paramIndex = 2;

    if (type) {
      conditions.push(`type = $${paramIndex++}`);
      params.push(type);
    }

    if (validOnly) {
      conditions.push('revoked_at IS NULL');
      conditions.push('valid_until > NOW()');
    }

    params.push(limit);

    const result = await query<AttestationRow>(
      `SELECT * FROM attestations
       WHERE ${conditions.join(' AND ')}
       ORDER BY issued_at DESC
       LIMIT $${paramIndex}`,
      params
    );

    return result.rows;
  }

  /**
   * Get valid attestations for an agent
   */
  async getValidForAgent(agentId: string): Promise<AttestationRow[]> {
    return this.getForAgent(agentId, { validOnly: true });
  }

  /**
   * Get latest attestation by type for an agent
   */
  async getLatestByType(
    agentId: string,
    type: AttestationType
  ): Promise<AttestationRow | null> {
    const result = await query<AttestationRow>(
      `SELECT * FROM attestations
       WHERE agent_id = $1 AND type = $2 AND revoked_at IS NULL
       ORDER BY issued_at DESC
       LIMIT 1`,
      [agentId, type]
    );
    return result.rows[0] || null;
  }

  /**
   * Revoke an attestation
   */
  async revoke(attestationId: string, reason: string): Promise<boolean> {
    const result = await query(
      `UPDATE attestations
       SET revoked_at = NOW(), revocation_reason = $1
       WHERE attestation_id = $2 AND revoked_at IS NULL`,
      [reason, attestationId]
    );

    if ((result.rowCount || 0) > 0) {
      logger.warn({ attestationId, reason }, 'Attestation revoked');
    }

    return (result.rowCount || 0) > 0;
  }

  /**
   * Revoke all attestations for an agent
   */
  async revokeAllForAgent(agentId: string, reason: string): Promise<number> {
    const result = await query(
      `UPDATE attestations
       SET revoked_at = NOW(), revocation_reason = $1
       WHERE agent_id = $2 AND revoked_at IS NULL`,
      [reason, agentId]
    );

    const count = result.rowCount || 0;
    if (count > 0) {
      logger.warn({ agentId, reason, count }, 'All attestations revoked for agent');
    }

    return count;
  }

  /**
   * Check if attestation is valid
   */
  async isValid(attestationId: string): Promise<boolean> {
    const result = await query<{ valid: boolean }>(
      `SELECT EXISTS(
        SELECT 1 FROM attestations
        WHERE attestation_id = $1
          AND revoked_at IS NULL
          AND valid_until > NOW()
      ) as valid`,
      [attestationId]
    );
    return result.rows[0].valid;
  }

  /**
   * Get expiring attestations
   */
  async getExpiringSoon(
    daysAhead: number = 7
  ): Promise<(AttestationRow & { identity_hash: string })[]> {
    const result = await query<AttestationRow & { identity_hash: string }>(
      `SELECT a.*, ai.identity_hash
       FROM attestations a
       JOIN agent_identities ai ON ai.id = a.agent_id
       WHERE a.revoked_at IS NULL
         AND a.valid_until > NOW()
         AND a.valid_until < NOW() + INTERVAL '1 day' * $1
       ORDER BY a.valid_until ASC`,
      [daysAhead]
    );
    return result.rows;
  }

  // ===========================================================================
  // PROXY LOG OPERATIONS
  // ===========================================================================

  /**
   * Create a proxy log entry
   */
  async createProxyLog(input: CreateProxyLogInput): Promise<ProxyLogRow> {
    const result = await query<ProxyLogRow>(
      `INSERT INTO proxy_logs (
        request_id, agent_id, request_received_at, request_forwarded_at,
        response_received_at, response_sent_at, original_request_hash,
        forwarded_request_hash, received_response_hash, sent_response_hash,
        model_provider, model_id, tokens_input, tokens_output, attestation_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      RETURNING *`,
      [
        input.requestId,
        input.agentId || null,
        input.requestReceivedAt,
        input.requestForwardedAt,
        input.responseReceivedAt,
        input.responseSentAt,
        input.originalRequestHash,
        input.forwardedRequestHash,
        input.receivedResponseHash,
        input.sentResponseHash,
        input.modelProvider || null,
        input.modelId || null,
        input.tokensInput || null,
        input.tokensOutput || null,
        input.attestationId || null,
      ]
    );

    return result.rows[0];
  }

  /**
   * Get proxy log by request ID
   */
  async getProxyLog(requestId: string): Promise<ProxyLogRow | null> {
    const result = await query<ProxyLogRow>(
      'SELECT * FROM proxy_logs WHERE request_id = $1',
      [requestId]
    );
    return result.rows[0] || null;
  }

  /**
   * Get proxy logs for an agent
   */
  async getProxyLogsForAgent(
    agentId: string,
    options: {
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<ProxyLogRow[]> {
    const { limit = 100, offset = 0 } = options;

    const result = await query<ProxyLogRow>(
      `SELECT * FROM proxy_logs
       WHERE agent_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [agentId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Link attestation to proxy log
   */
  async linkAttestationToProxyLog(
    requestId: string,
    attestationId: string
  ): Promise<boolean> {
    const result = await query(
      `UPDATE proxy_logs
       SET attestation_id = $1
       WHERE request_id = $2`,
      [attestationId, requestId]
    );
    return (result.rowCount || 0) > 0;
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get attestation statistics
   */
  async getStats(): Promise<{
    total: number;
    valid: number;
    revoked: number;
    expired: number;
    byType: Record<string, number>;
    byTrustLevel: Record<string, number>;
  }> {
    const [countResult, typeResult, trustResult] = await Promise.all([
      query<{
        total: string;
        valid: string;
        revoked: string;
        expired: string;
      }>(
        `SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE revoked_at IS NULL AND valid_until > NOW()) as valid,
          COUNT(*) FILTER (WHERE revoked_at IS NOT NULL) as revoked,
          COUNT(*) FILTER (WHERE revoked_at IS NULL AND valid_until <= NOW()) as expired
         FROM attestations`
      ),
      query<{ type: string; count: string }>(
        'SELECT type, COUNT(*) as count FROM attestations GROUP BY type'
      ),
      query<{ trust_level: string; count: string }>(
        'SELECT trust_level, COUNT(*) as count FROM attestations GROUP BY trust_level'
      ),
    ]);

    const counts = countResult.rows[0];
    const byType: Record<string, number> = {};
    for (const row of typeResult.rows) {
      byType[row.type] = parseInt(row.count);
    }
    const byTrustLevel: Record<string, number> = {};
    for (const row of trustResult.rows) {
      byTrustLevel[row.trust_level] = parseInt(row.count);
    }

    return {
      total: parseInt(counts.total),
      valid: parseInt(counts.valid),
      revoked: parseInt(counts.revoked),
      expired: parseInt(counts.expired),
      byType,
      byTrustLevel,
    };
  }

  /**
   * Get proxy log statistics
   */
  async getProxyStats(): Promise<{
    totalRequests: number;
    avgLatencyMs: number;
    totalTokensIn: number;
    totalTokensOut: number;
  }> {
    const result = await query<{
      total: string;
      avg_latency: string;
      tokens_in: string;
      tokens_out: string;
    }>(
      `SELECT
        COUNT(*) as total,
        AVG(response_sent_at - request_received_at) / 1000.0 as avg_latency,
        COALESCE(SUM(tokens_input), 0) as tokens_in,
        COALESCE(SUM(tokens_output), 0) as tokens_out
       FROM proxy_logs`
    );

    const row = result.rows[0];
    return {
      totalRequests: parseInt(row.total),
      avgLatencyMs: parseFloat(row.avg_latency) || 0,
      totalTokensIn: parseInt(row.tokens_in),
      totalTokensOut: parseInt(row.tokens_out),
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let attestationRepositoryInstance: AttestationRepository | null = null;

export function getAttestationRepository(): AttestationRepository {
  if (!attestationRepositoryInstance) {
    attestationRepositoryInstance = new AttestationRepository();
  }
  return attestationRepositoryInstance;
}
