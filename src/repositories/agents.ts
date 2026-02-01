/**
 * Agent007 - Agent Repository
 *
 * Database operations for agent identities and related data.
 */

import { query, transaction, buildInsert, buildUpdate } from '../config/database.js';
import {
  IdentityStatus,
  ModelProvider,
  type AgentCoreIdentity,
  type AgentMetadata,
} from '../types/identity.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface AgentIdentityRow {
  id: string;
  identity_hash: string;
  agent_id?: string;
  previous_version?: string;
  version_number?: number;
  creator_id: string;
  owner_address?: string;
  operator_address?: string;
  status: IdentityStatus;
  status_reason?: string;
  created_at: Date;
  validated_at?: Date;
  suspended_at?: Date;
  revoked_at?: Date;
  archived_at?: Date;
  last_verified_at?: Date;
}

export interface AgentCoreConfigRow {
  id: string;
  agent_id: string;
  system_prompt_hash: string;
  system_prompt_encrypted: Buffer;
  system_prompt_version: string;
  encryption_key_id: string;
  model_provider: string;
  model_id: string;
  model_version?: string;
  api_endpoint: string;
  api_key_hash: string;
  auth_method: string;
  parameters: Record<string, any>;
  model_config_hash: string;
  parameters_hash: string;
  tools_hash: string;
  knowledge_base_hash: string;
  sealed_at?: Date;
  created_at: Date;
}

export interface AgentMetadataRow {
  id: string;
  agent_id: string;
  display_name: string;
  avatar_url?: string;
  bio?: string;
  tags: string[];
  social_twitter?: string;
  social_github?: string;
  social_website?: string;
  created_at: Date;
  updated_at: Date;
}

export interface AgentToolRow {
  id: string;
  agent_id: string;
  name: string;
  description: string;
  description_hash: string;
  parameters_schema: Record<string, any>;
  parameters_schema_hash: string;
  tool_hash: string;
  position: number;
  created_at: Date;
}

export interface AgentWithDetails {
  identity: AgentIdentityRow;
  config: AgentCoreConfigRow;
  metadata: AgentMetadataRow;
  tools: AgentToolRow[];
}

// =============================================================================
// AGENT REPOSITORY
// =============================================================================

export class AgentRepository {
  // ===========================================================================
  // CREATE OPERATIONS
  // ===========================================================================

  /**
   * Create a new agent identity with all related data
   */
  async createAgent(
    creatorId: string,
    identityHash: string,
    agentCore: AgentCoreIdentity,
    metadata: AgentMetadata,
    encryptedSystemPrompt: Buffer,
    encryptionKeyId: string,
    hashes: {
      modelConfigHash: string;
      parametersHash: string;
      toolsHash: string;
      knowledgeBaseHash: string;
    }
  ): Promise<AgentIdentityRow> {
    return transaction(async (client) => {
      // 1. Create identity
      const identityResult = await client.query<AgentIdentityRow>(
        `INSERT INTO agent_identities (identity_hash, creator_id, status)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [identityHash, creatorId, IdentityStatus.PENDING]
      );
      const identity = identityResult.rows[0];

      // 2. Create core config
      await client.query(
        `INSERT INTO agent_core_configs (
          agent_id, system_prompt_hash, system_prompt_encrypted, system_prompt_version,
          encryption_key_id, model_provider, model_id, model_version, api_endpoint,
          api_key_hash, auth_method, parameters, model_config_hash, parameters_hash,
          tools_hash, knowledge_base_hash
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
        [
          identity.id,
          agentCore.systemPrompt.hash,
          encryptedSystemPrompt,
          agentCore.systemPrompt.version,
          encryptionKeyId,
          agentCore.model.provider,
          agentCore.model.modelId,
          agentCore.model.modelVersion || null,
          agentCore.model.apiEndpoint,
          agentCore.model.apiKeyHash,
          agentCore.model.authMethod,
          JSON.stringify(agentCore.parameters),
          hashes.modelConfigHash,
          hashes.parametersHash,
          hashes.toolsHash,
          hashes.knowledgeBaseHash,
        ]
      );

      // 3. Create metadata
      await client.query(
        `INSERT INTO agent_metadata (
          agent_id, display_name, avatar_url, bio, tags,
          social_twitter, social_github, social_website
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          identity.id,
          metadata.displayName,
          metadata.avatar || null,
          metadata.bio || null,
          metadata.tags || [],
          metadata.socialLinks?.twitter || null,
          metadata.socialLinks?.github || null,
          metadata.socialLinks?.website || null,
        ]
      );

      // 4. Create tools
      if (agentCore.tools && agentCore.tools.length > 0) {
        for (let i = 0; i < agentCore.tools.length; i++) {
          const tool = agentCore.tools[i];
          await client.query(
            `INSERT INTO agent_tools (
              agent_id, name, description, description_hash,
              parameters_schema, parameters_schema_hash, tool_hash, position
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
              identity.id,
              tool.name,
              tool.description,
              tool.hash || '',
              JSON.stringify(tool.parameters),
              tool.hash || '',
              tool.hash || '',
              i,
            ]
          );
        }
      }

      logger.info({ identityHash, agentId: identity.id }, 'Agent created in database');

      return identity;
    });
  }

  // ===========================================================================
  // READ OPERATIONS
  // ===========================================================================

  /**
   * Find agent by identity hash
   */
  async findByHash(identityHash: string): Promise<AgentWithDetails | null> {
    const identityResult = await query<AgentIdentityRow>(
      'SELECT * FROM agent_identities WHERE identity_hash = $1',
      [identityHash]
    );

    if (identityResult.rows.length === 0) {
      return null;
    }

    const identity = identityResult.rows[0];
    return this.loadAgentDetails(identity);
  }

  /**
   * Find agent by agentId (stable identifier)
   */
  async findByAgentId(agentId: string): Promise<AgentWithDetails | null> {
    const identityResult = await query<AgentIdentityRow>(
      'SELECT * FROM agent_identities WHERE agent_id = $1 ORDER BY version_number DESC LIMIT 1',
      [agentId]
    );

    if (identityResult.rows.length === 0) {
      return null;
    }

    const identity = identityResult.rows[0];
    return this.loadAgentDetails(identity);
  }

  /**
   * Find agent by ID
   */
  async findById(id: string): Promise<AgentWithDetails | null> {
    const identityResult = await query<AgentIdentityRow>(
      'SELECT * FROM agent_identities WHERE id = $1',
      [id]
    );

    if (identityResult.rows.length === 0) {
      return null;
    }

    const identity = identityResult.rows[0];
    return this.loadAgentDetails(identity);
  }

  /**
   * Load all details for an agent
   */
  private async loadAgentDetails(identity: AgentIdentityRow): Promise<AgentWithDetails> {
    const [configResult, metadataResult, toolsResult] = await Promise.all([
      query<AgentCoreConfigRow>(
        'SELECT * FROM agent_core_configs WHERE agent_id = $1',
        [identity.id]
      ),
      query<AgentMetadataRow>(
        'SELECT * FROM agent_metadata WHERE agent_id = $1',
        [identity.id]
      ),
      query<AgentToolRow>(
        'SELECT * FROM agent_tools WHERE agent_id = $1 ORDER BY position',
        [identity.id]
      ),
    ]);

    return {
      identity,
      config: configResult.rows[0],
      metadata: metadataResult.rows[0],
      tools: toolsResult.rows,
    };
  }

  /**
   * List agents with pagination and filters
   */
  async list(options: {
    status?: IdentityStatus;
    creatorId?: string;
    provider?: ModelProvider;
    page?: number;
    pageSize?: number;
    sortBy?: 'created_at' | 'validated_at' | 'display_name';
    sortOrder?: 'asc' | 'desc';
  } = {}): Promise<{ agents: AgentWithDetails[]; total: number }> {
    const {
      status,
      creatorId,
      provider,
      page = 1,
      pageSize = 20,
      sortBy = 'created_at',
      sortOrder = 'desc',
    } = options;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (status) {
      conditions.push(`ai.status = $${paramIndex++}`);
      params.push(status);
    }

    if (creatorId) {
      conditions.push(`ai.creator_id = $${paramIndex++}`);
      params.push(creatorId);
    }

    if (provider) {
      conditions.push(`acc.model_provider = $${paramIndex++}`);
      params.push(provider);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count
       FROM agent_identities ai
       LEFT JOIN agent_core_configs acc ON acc.agent_id = ai.id
       ${whereClause}`,
      params
    );
    const total = parseInt(countResult.rows[0].count);

    // Get paginated results
    const offset = (page - 1) * pageSize;
    const orderColumn = sortBy === 'display_name' ? 'am.display_name' : `ai.${sortBy}`;

    const listResult = await query<AgentIdentityRow>(
      `SELECT ai.*
       FROM agent_identities ai
       LEFT JOIN agent_core_configs acc ON acc.agent_id = ai.id
       LEFT JOIN agent_metadata am ON am.agent_id = ai.id
       ${whereClause}
       ORDER BY ${orderColumn} ${sortOrder}
       LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
      [...params, pageSize, offset]
    );

    // Load details for each agent
    const agents = await Promise.all(
      listResult.rows.map((identity) => this.loadAgentDetails(identity))
    );

    return { agents, total };
  }

  /**
   * Check if identity hash exists
   */
  async exists(identityHash: string): Promise<boolean> {
    const result = await query<{ exists: boolean }>(
      'SELECT EXISTS(SELECT 1 FROM agent_identities WHERE identity_hash = $1) as exists',
      [identityHash]
    );
    return result.rows[0].exists;
  }

  // ===========================================================================
  // UPDATE OPERATIONS
  // ===========================================================================

  /**
   * Update agent status
   */
  async updateStatus(
    identityHash: string,
    status: IdentityStatus,
    reason?: string
  ): Promise<AgentIdentityRow | null> {
    const updateData: Record<string, any> = { status, status_reason: reason || null };

    // Set appropriate timestamp based on status
    switch (status) {
      case IdentityStatus.VALIDATED:
        updateData.validated_at = new Date();
        break;
      case IdentityStatus.SUSPENDED:
        updateData.suspended_at = new Date();
        break;
      case IdentityStatus.REVOKED:
        updateData.revoked_at = new Date();
        break;
      case IdentityStatus.ARCHIVED:
        updateData.archived_at = new Date();
        break;
    }

    const result = await query<AgentIdentityRow>(
      `UPDATE agent_identities
       SET status = $1, status_reason = $2,
           validated_at = COALESCE($3, validated_at),
           suspended_at = COALESCE($4, suspended_at),
           revoked_at = COALESCE($5, revoked_at),
           archived_at = COALESCE($6, archived_at)
       WHERE identity_hash = $7
       RETURNING *`,
      [
        status,
        reason || null,
        updateData.validated_at || null,
        updateData.suspended_at || null,
        updateData.revoked_at || null,
        updateData.archived_at || null,
        identityHash,
      ]
    );

    if (result.rows.length === 0) {
      return null;
    }

    logger.info({ identityHash, status }, 'Agent status updated');
    return result.rows[0];
  }

  /**
   * Update last verified timestamp
   */
  async updateLastVerified(identityHash: string): Promise<void> {
    await query(
      'UPDATE agent_identities SET last_verified_at = NOW() WHERE identity_hash = $1',
      [identityHash]
    );
  }

  /**
   * Update agent metadata
   */
  async updateMetadata(
    identityHash: string,
    metadata: Partial<AgentMetadata>
  ): Promise<AgentMetadataRow | null> {
    const agent = await this.findByHash(identityHash);
    if (!agent) return null;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    if (metadata.displayName !== undefined) {
      updates.push(`display_name = $${paramIndex++}`);
      params.push(metadata.displayName);
    }
    if (metadata.avatar !== undefined) {
      updates.push(`avatar_url = $${paramIndex++}`);
      params.push(metadata.avatar);
    }
    if (metadata.bio !== undefined) {
      updates.push(`bio = $${paramIndex++}`);
      params.push(metadata.bio);
    }
    if (metadata.tags !== undefined) {
      updates.push(`tags = $${paramIndex++}`);
      params.push(metadata.tags);
    }

    if (updates.length === 0) return agent.metadata;

    updates.push('updated_at = NOW()');
    params.push(agent.identity.id);

    const result = await query<AgentMetadataRow>(
      `UPDATE agent_metadata SET ${updates.join(', ')} WHERE agent_id = $${paramIndex} RETURNING *`,
      params
    );

    return result.rows[0] || null;
  }

  /**
   * Seal agent configuration (makes it immutable)
   */
  async sealConfig(identityHash: string, sealedBy: string): Promise<boolean> {
    const agent = await this.findByHash(identityHash);
    if (!agent) return false;

    await query(
      'UPDATE agent_core_configs SET sealed_at = NOW(), sealed_by = $1 WHERE agent_id = $2',
      [sealedBy, agent.identity.id]
    );

    logger.info({ identityHash, sealedBy }, 'Agent configuration sealed');
    return true;
  }

  // ===========================================================================
  // STATISTICS
  // ===========================================================================

  /**
   * Get agent statistics
   */
  async getStats(): Promise<{
    total: number;
    byStatus: Record<IdentityStatus, number>;
    byProvider: Record<string, number>;
  }> {
    const [statusResult, providerResult] = await Promise.all([
      query<{ status: IdentityStatus; count: string }>(
        'SELECT status, COUNT(*) as count FROM agent_identities GROUP BY status'
      ),
      query<{ model_provider: string; count: string }>(
        'SELECT model_provider, COUNT(*) as count FROM agent_core_configs GROUP BY model_provider'
      ),
    ]);

    const byStatus: Record<string, number> = {};
    let total = 0;
    for (const row of statusResult.rows) {
      byStatus[row.status] = parseInt(row.count);
      total += parseInt(row.count);
    }

    const byProvider: Record<string, number> = {};
    for (const row of providerResult.rows) {
      byProvider[row.model_provider] = parseInt(row.count);
    }

    return {
      total,
      byStatus: byStatus as Record<IdentityStatus, number>,
      byProvider,
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let agentRepositoryInstance: AgentRepository | null = null;

export function getAgentRepository(): AgentRepository {
  if (!agentRepositoryInstance) {
    agentRepositoryInstance = new AgentRepository();
  }
  return agentRepositoryInstance;
}
