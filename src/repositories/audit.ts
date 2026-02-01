/**
 * Agent007 - Audit Log Repository
 *
 * Database operations for audit trail and system events.
 */

import { query } from '../config/database.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export type ActorType = 'system' | 'creator' | 'admin' | 'agent';

export type EntityType =
  | 'agent_identity'
  | 'creator'
  | 'attestation'
  | 'verification'
  | 'alert';

export interface AuditLogRow {
  id: string;
  entity_type: EntityType;
  entity_id: string;
  action: string;
  action_category?: string;
  actor_type: ActorType;
  actor_id?: string;
  actor_ip?: string;
  actor_user_agent?: string;
  old_values?: Record<string, any>;
  new_values?: Record<string, any>;
  metadata?: Record<string, any>;
  created_at: Date;
}

export interface CreateAuditLogInput {
  entityType: EntityType;
  entityId: string;
  action: string;
  actionCategory?: string;
  actorType: ActorType;
  actorId?: string;
  actorIp?: string;
  actorUserAgent?: string;
  oldValues?: Record<string, any>;
  newValues?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface AuditLogFilter {
  entityType?: EntityType;
  entityId?: string;
  action?: string;
  actionCategory?: string;
  actorType?: ActorType;
  actorId?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

// =============================================================================
// AUDIT LOG REPOSITORY
// =============================================================================

export class AuditLogRepository {
  // ===========================================================================
  // CREATE OPERATIONS
  // ===========================================================================

  /**
   * Create an audit log entry
   */
  async log(input: CreateAuditLogInput): Promise<AuditLogRow> {
    const result = await query<AuditLogRow>(
      `INSERT INTO audit_log (
        entity_type, entity_id, action, action_category,
        actor_type, actor_id, actor_ip, actor_user_agent,
        old_values, new_values, metadata
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      RETURNING *`,
      [
        input.entityType,
        input.entityId,
        input.action,
        input.actionCategory || null,
        input.actorType,
        input.actorId || null,
        input.actorIp || null,
        input.actorUserAgent || null,
        input.oldValues ? JSON.stringify(input.oldValues) : null,
        input.newValues ? JSON.stringify(input.newValues) : null,
        input.metadata ? JSON.stringify(input.metadata) : null,
      ]
    );

    logger.debug(
      {
        entityType: input.entityType,
        entityId: input.entityId,
        action: input.action,
      },
      'Audit log entry created'
    );

    return result.rows[0];
  }

  /**
   * Log system action
   */
  async logSystem(
    entityType: EntityType,
    entityId: string,
    action: string,
    details?: {
      actionCategory?: string;
      oldValues?: Record<string, any>;
      newValues?: Record<string, any>;
      metadata?: Record<string, any>;
    }
  ): Promise<AuditLogRow> {
    return this.log({
      entityType,
      entityId,
      action,
      actorType: 'system',
      ...details,
    });
  }

  /**
   * Log creator action
   */
  async logCreator(
    creatorId: string,
    entityType: EntityType,
    entityId: string,
    action: string,
    details?: {
      actionCategory?: string;
      oldValues?: Record<string, any>;
      newValues?: Record<string, any>;
      metadata?: Record<string, any>;
      actorIp?: string;
      actorUserAgent?: string;
    }
  ): Promise<AuditLogRow> {
    return this.log({
      entityType,
      entityId,
      action,
      actorType: 'creator',
      actorId: creatorId,
      ...details,
    });
  }

  /**
   * Log admin action
   */
  async logAdmin(
    adminId: string,
    entityType: EntityType,
    entityId: string,
    action: string,
    details?: {
      actionCategory?: string;
      oldValues?: Record<string, any>;
      newValues?: Record<string, any>;
      metadata?: Record<string, any>;
      actorIp?: string;
      actorUserAgent?: string;
    }
  ): Promise<AuditLogRow> {
    return this.log({
      entityType,
      entityId,
      action,
      actorType: 'admin',
      actorId: adminId,
      ...details,
    });
  }

  // ===========================================================================
  // READ OPERATIONS
  // ===========================================================================

  /**
   * Get audit log entry by ID
   */
  async findById(id: string): Promise<AuditLogRow | null> {
    const result = await query<AuditLogRow>(
      'SELECT * FROM audit_log WHERE id = $1',
      [id]
    );
    return result.rows[0] || null;
  }

  /**
   * Get audit logs for an entity
   */
  async getForEntity(
    entityType: EntityType,
    entityId: string,
    options: {
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<AuditLogRow[]> {
    const { limit = 100, offset = 0 } = options;

    const result = await query<AuditLogRow>(
      `SELECT * FROM audit_log
       WHERE entity_type = $1 AND entity_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [entityType, entityId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Get audit logs by actor
   */
  async getByActor(
    actorType: ActorType,
    actorId: string,
    options: {
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<AuditLogRow[]> {
    const { limit = 100, offset = 0 } = options;

    const result = await query<AuditLogRow>(
      `SELECT * FROM audit_log
       WHERE actor_type = $1 AND actor_id = $2
       ORDER BY created_at DESC
       LIMIT $3 OFFSET $4`,
      [actorType, actorId, limit, offset]
    );

    return result.rows;
  }

  /**
   * Search audit logs with filters
   */
  async search(filter: AuditLogFilter): Promise<{ logs: AuditLogRow[]; total: number }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (filter.entityType) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(filter.entityType);
    }

    if (filter.entityId) {
      conditions.push(`entity_id = $${paramIndex++}`);
      params.push(filter.entityId);
    }

    if (filter.action) {
      conditions.push(`action = $${paramIndex++}`);
      params.push(filter.action);
    }

    if (filter.actionCategory) {
      conditions.push(`action_category = $${paramIndex++}`);
      params.push(filter.actionCategory);
    }

    if (filter.actorType) {
      conditions.push(`actor_type = $${paramIndex++}`);
      params.push(filter.actorType);
    }

    if (filter.actorId) {
      conditions.push(`actor_id = $${paramIndex++}`);
      params.push(filter.actorId);
    }

    if (filter.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(filter.startDate);
    }

    if (filter.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(filter.endDate);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const limit = filter.limit || 100;
    const offset = filter.offset || 0;

    const [countResult, logsResult] = await Promise.all([
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM audit_log ${whereClause}`,
        params
      ),
      query<AuditLogRow>(
        `SELECT * FROM audit_log ${whereClause}
         ORDER BY created_at DESC
         LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
        [...params, limit, offset]
      ),
    ]);

    return {
      logs: logsResult.rows,
      total: parseInt(countResult.rows[0].count),
    };
  }

  /**
   * Get recent logs
   */
  async getRecent(limit: number = 50): Promise<AuditLogRow[]> {
    const result = await query<AuditLogRow>(
      `SELECT * FROM audit_log
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  }

  /**
   * Get logs by action category
   */
  async getByCategory(
    category: string,
    options: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    } = {}
  ): Promise<AuditLogRow[]> {
    const { limit = 100, offset = 0, startDate, endDate } = options;

    const conditions: string[] = ['action_category = $1'];
    const params: any[] = [category];
    let paramIndex = 2;

    if (startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(startDate);
    }

    if (endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(endDate);
    }

    params.push(limit, offset);

    const result = await query<AuditLogRow>(
      `SELECT * FROM audit_log
       WHERE ${conditions.join(' AND ')}
       ORDER BY created_at DESC
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      params
    );

    return result.rows;
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get audit log statistics
   */
  async getStats(options: {
    startDate?: Date;
    endDate?: Date;
  } = {}): Promise<{
    total: number;
    byEntityType: Record<string, number>;
    byAction: Record<string, number>;
    byActorType: Record<string, number>;
  }> {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (options.startDate) {
      conditions.push(`created_at >= $${paramIndex++}`);
      params.push(options.startDate);
    }

    if (options.endDate) {
      conditions.push(`created_at <= $${paramIndex++}`);
      params.push(options.endDate);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    const [totalResult, entityResult, actionResult, actorResult] = await Promise.all([
      query<{ count: string }>(
        `SELECT COUNT(*) as count FROM audit_log ${whereClause}`,
        params
      ),
      query<{ entity_type: string; count: string }>(
        `SELECT entity_type, COUNT(*) as count
         FROM audit_log ${whereClause}
         GROUP BY entity_type`,
        params
      ),
      query<{ action: string; count: string }>(
        `SELECT action, COUNT(*) as count
         FROM audit_log ${whereClause}
         GROUP BY action
         ORDER BY count DESC
         LIMIT 20`,
        params
      ),
      query<{ actor_type: string; count: string }>(
        `SELECT actor_type, COUNT(*) as count
         FROM audit_log ${whereClause}
         GROUP BY actor_type`,
        params
      ),
    ]);

    const byEntityType: Record<string, number> = {};
    for (const row of entityResult.rows) {
      byEntityType[row.entity_type] = parseInt(row.count);
    }

    const byAction: Record<string, number> = {};
    for (const row of actionResult.rows) {
      byAction[row.action] = parseInt(row.count);
    }

    const byActorType: Record<string, number> = {};
    for (const row of actorResult.rows) {
      byActorType[row.actor_type] = parseInt(row.count);
    }

    return {
      total: parseInt(totalResult.rows[0].count),
      byEntityType,
      byAction,
      byActorType,
    };
  }

  /**
   * Get activity timeline
   */
  async getTimeline(options: {
    entityType?: EntityType;
    entityId?: string;
    days?: number;
  } = {}): Promise<{ date: string; count: number }[]> {
    const { entityType, entityId, days = 30 } = options;

    const conditions: string[] = [
      `created_at >= NOW() - INTERVAL '${days} days'`,
    ];
    const params: any[] = [];
    let paramIndex = 1;

    if (entityType) {
      conditions.push(`entity_type = $${paramIndex++}`);
      params.push(entityType);
    }

    if (entityId) {
      conditions.push(`entity_id = $${paramIndex++}`);
      params.push(entityId);
    }

    const result = await query<{ date: string; count: string }>(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM audit_log
       WHERE ${conditions.join(' AND ')}
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      params
    );

    return result.rows.map((row) => ({
      date: row.date,
      count: parseInt(row.count),
    }));
  }

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  /**
   * Delete old audit logs (for maintenance)
   */
  async deleteOldLogs(olderThanDays: number): Promise<number> {
    const result = await query(
      `DELETE FROM audit_log
       WHERE created_at < NOW() - INTERVAL '1 day' * $1`,
      [olderThanDays]
    );

    const count = result.rowCount || 0;
    if (count > 0) {
      logger.info({ count, olderThanDays }, 'Old audit logs deleted');
    }

    return count;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let auditLogRepositoryInstance: AuditLogRepository | null = null;

export function getAuditLogRepository(): AuditLogRepository {
  if (!auditLogRepositoryInstance) {
    auditLogRepositoryInstance = new AuditLogRepository();
  }
  return auditLogRepositoryInstance;
}
