/**
 * Agent007 - Agent Storage Service
 *
 * Abstracts storage operations with database persistence and in-memory fallback.
 */

import { v4 as uuidv4 } from 'uuid';
import { checkConnection } from '../../config/database.js';
import { getAgentRepository, type AgentWithDetails } from '../../repositories/agents.js';
import { getCreatorRepository } from '../../repositories/creators.js';
import { getAuditLogRepository } from '../../repositories/audit.js';
import { logger } from '../../utils/logger.js';
import {
  IdentityStatus,
  type AgentCoreIdentity,
  type AgentMetadata,
} from '../../types/identity.js';

// =============================================================================
// TYPES
// =============================================================================

export interface StoredRegistration {
  id: string;
  creatorId: string;
  agentCore: AgentCoreIdentity;
  metadata: AgentMetadata;
  identityHash: string;
  challengeEncrypted: {
    data: string;
    keyId: string;
    algorithm: string;
    version: string;
  };
  challengeId: string;
  status: 'pending' | 'validating' | 'validated' | 'failed';
  createdAt: Date;
  expiresAt: Date;
}

export interface StoredIdentity {
  id: string;
  identityHash: string;
  agentId?: string;
  previousVersion?: string | null;
  versionNumber?: number;
  creatorId: string;
  status: IdentityStatus;
  agentCore: AgentCoreIdentity;
  metadata: AgentMetadata;
  roles?: {
    creator: string;
    owner: string;
    operator?: string;
  };
  createdAt: Date;
  validatedAt?: Date;
  suspendedAt?: Date;
  revokedAt?: Date;
}

// =============================================================================
// AGENT STORAGE SERVICE
// =============================================================================

export class AgentStorageService {
  private registrations = new Map<string, StoredRegistration>();
  private identities = new Map<string, StoredIdentity>();
  private dbAvailable = false;

  constructor() {
    this.checkDatabaseConnection();
  }

  /**
   * Check if database is available
   */
  private async checkDatabaseConnection(): Promise<void> {
    try {
      this.dbAvailable = await checkConnection();
      if (this.dbAvailable) {
        logger.info('Agent storage using database persistence');
      } else {
        logger.warn('Agent storage using in-memory fallback');
      }
    } catch {
      this.dbAvailable = false;
      logger.warn('Agent storage using in-memory fallback');
    }
  }

  /**
   * Refresh database connection status
   */
  async refreshConnection(): Promise<boolean> {
    await this.checkDatabaseConnection();
    return this.dbAvailable;
  }

  /**
   * Check if using database
   */
  isUsingDatabase(): boolean {
    return this.dbAvailable;
  }

  // ===========================================================================
  // REGISTRATION OPERATIONS
  // ===========================================================================

  /**
   * Store a registration
   */
  async saveRegistration(registration: StoredRegistration): Promise<void> {
    // Always store in memory for fast access during validation flow
    this.registrations.set(registration.id, registration);

    // TODO: Persist to database validation_challenges table when DB available
    if (this.dbAvailable) {
      try {
        const auditRepo = getAuditLogRepository();
        await auditRepo.logSystem('agent_identity', registration.id, 'registration_created', {
          metadata: {
            identityHash: registration.identityHash,
            creatorId: registration.creatorId,
          },
        });
      } catch (error) {
        logger.error({ error }, 'Failed to log registration to audit');
      }
    }
  }

  /**
   * Get a registration by ID
   */
  getRegistration(registrationId: string): StoredRegistration | undefined {
    return this.registrations.get(registrationId);
  }

  /**
   * Update registration status
   */
  updateRegistrationStatus(
    registrationId: string,
    status: StoredRegistration['status']
  ): boolean {
    const registration = this.registrations.get(registrationId);
    if (!registration) return false;

    registration.status = status;
    return true;
  }

  /**
   * Delete expired registrations
   */
  cleanupExpiredRegistrations(): number {
    const now = new Date();
    let count = 0;

    for (const [id, registration] of this.registrations) {
      if (registration.expiresAt < now && registration.status === 'pending') {
        this.registrations.delete(id);
        count++;
      }
    }

    if (count > 0) {
      logger.info({ count }, 'Cleaned up expired registrations');
    }

    return count;
  }

  // ===========================================================================
  // IDENTITY OPERATIONS
  // ===========================================================================

  /**
   * Save a validated identity
   */
  async saveIdentity(identity: StoredIdentity): Promise<string> {
    // Store in memory
    this.identities.set(identity.identityHash, identity);

    // Persist to database if available
    if (this.dbAvailable) {
      try {
        const agentRepo = getAgentRepository();
        const encryptedSystemPrompt = Buffer.from(identity.agentCore.systemPrompt.content);

        const dbIdentity = await agentRepo.createAgent(
          identity.creatorId,
          identity.identityHash,
          identity.agentCore,
          identity.metadata,
          encryptedSystemPrompt,
          'default-key',
          {
            modelConfigHash: identity.agentCore.model.apiKeyHash,
            parametersHash: identity.agentCore.systemPrompt.hash,
            toolsHash: identity.agentCore.tools?.length
              ? identity.agentCore.tools[0].hash || ''
              : '',
            knowledgeBaseHash: '',
          }
        );

        // Update status to validated
        await agentRepo.updateStatus(
          identity.identityHash,
          IdentityStatus.VALIDATED
        );

        logger.info(
          { identityHash: identity.identityHash, dbId: dbIdentity.id },
          'Identity persisted to database'
        );

        return dbIdentity.id;
      } catch (error) {
        logger.error({ error, identityHash: identity.identityHash },
          'Failed to persist identity to database - using memory only');
      }
    }

    return identity.id;
  }

  /**
   * Get identity by hash
   */
  async getIdentity(identityHash: string): Promise<StoredIdentity | null> {
    // Check memory first
    const memoryIdentity = this.identities.get(identityHash);
    if (memoryIdentity) {
      return memoryIdentity;
    }

    // Try database if available
    if (this.dbAvailable) {
      try {
        const agentRepo = getAgentRepository();
        const dbAgent = await agentRepo.findByHash(identityHash);

        if (dbAgent) {
          // Convert to StoredIdentity and cache in memory
          const identity = this.dbAgentToStoredIdentity(dbAgent);
          this.identities.set(identityHash, identity);
          return identity;
        }
      } catch (error) {
        logger.error({ error, identityHash }, 'Failed to fetch identity from database');
      }
    }

    return null;
  }

  /**
   * Get identity by agentId (stable identifier)
   */
  async getIdentityByAgentId(agentId: string): Promise<StoredIdentity | null> {
    // Check memory first (scan all identities)
    for (const identity of this.identities.values()) {
      if (identity.agentId === agentId) {
        return identity;
      }
    }

    // Try database if available
    if (this.dbAvailable) {
      try {
        const agentRepo = getAgentRepository();
        const dbAgent = await agentRepo.findByAgentId(agentId);

        if (dbAgent) {
          const identity = this.dbAgentToStoredIdentity(dbAgent);
          this.identities.set(identity.identityHash, identity);
          return identity;
        }
      } catch (error) {
        logger.error({ error, agentId }, 'Failed to fetch identity by agentId from database');
      }
    }

    return null;
  }

  /**
   * Check if identity exists
   */
  async identityExists(identityHash: string): Promise<boolean> {
    // Check memory first
    if (this.identities.has(identityHash)) {
      return true;
    }

    // Check database if available
    if (this.dbAvailable) {
      try {
        const agentRepo = getAgentRepository();
        return await agentRepo.exists(identityHash);
      } catch (error) {
        logger.error({ error }, 'Failed to check identity existence in database');
      }
    }

    return false;
  }

  /**
   * Update identity status
   */
  async updateIdentityStatus(
    identityHash: string,
    status: IdentityStatus,
    reason?: string
  ): Promise<boolean> {
    // Update memory
    const identity = this.identities.get(identityHash);
    if (identity) {
      identity.status = status;
      if (status === IdentityStatus.SUSPENDED) {
        identity.suspendedAt = new Date();
      } else if (status === IdentityStatus.REVOKED) {
        identity.revokedAt = new Date();
      }
    }

    // Update database if available
    if (this.dbAvailable) {
      try {
        const agentRepo = getAgentRepository();
        const result = await agentRepo.updateStatus(identityHash, status, reason);
        return result !== null;
      } catch (error) {
        logger.error({ error, identityHash, status },
          'Failed to update identity status in database');
      }
    }

    return identity !== undefined;
  }

  /**
   * List identities
   */
  async listIdentities(options: {
    status?: IdentityStatus;
    creatorId?: string;
    page?: number;
    pageSize?: number;
  } = {}): Promise<{ identities: StoredIdentity[]; total: number }> {
    const { status, creatorId, page = 1, pageSize = 20 } = options;

    // Try database first
    if (this.dbAvailable) {
      try {
        const agentRepo = getAgentRepository();
        const result = await agentRepo.list({
          status,
          creatorId,
          page,
          pageSize,
        });

        const identities = result.agents.map((a) => this.dbAgentToStoredIdentity(a));

        // Cache in memory
        for (const identity of identities) {
          this.identities.set(identity.identityHash, identity);
        }

        return { identities, total: result.total };
      } catch (error) {
        logger.error({ error }, 'Failed to list identities from database');
      }
    }

    // Fallback to memory
    let identities = Array.from(this.identities.values());

    if (status) {
      identities = identities.filter((i) => i.status === status);
    }

    if (creatorId) {
      identities = identities.filter((i) => i.creatorId === creatorId);
    }

    const total = identities.length;
    const start = (page - 1) * pageSize;
    const paged = identities.slice(start, start + pageSize);

    return { identities: paged, total };
  }

  /**
   * Get all identity hashes (for iteration)
   */
  getAllIdentityHashes(): string[] {
    return Array.from(this.identities.keys());
  }

  /**
   * Get identity count
   */
  async getIdentityCount(): Promise<number> {
    if (this.dbAvailable) {
      try {
        const agentRepo = getAgentRepository();
        const stats = await agentRepo.getStats();
        return stats.total;
      } catch (error) {
        logger.error({ error }, 'Failed to get identity count from database');
      }
    }

    return this.identities.size;
  }

  // ===========================================================================
  // HELPER METHODS
  // ===========================================================================

  /**
   * Convert database agent to StoredIdentity
   */
  private dbAgentToStoredIdentity(dbAgent: AgentWithDetails): StoredIdentity {
    return {
      id: dbAgent.identity.id,
      identityHash: dbAgent.identity.identity_hash,
      creatorId: dbAgent.identity.creator_id,
      status: dbAgent.identity.status as IdentityStatus,
      agentCore: {
        systemPrompt: {
          content: '', // Not stored in plain text
          hash: dbAgent.config.system_prompt_hash,
          version: dbAgent.config.system_prompt_version,
          createdAt: dbAgent.config.created_at.toISOString(),
        },
        model: {
          provider: dbAgent.config.model_provider as any,
          modelId: dbAgent.config.model_id,
          modelVersion: dbAgent.config.model_version,
          apiKeyHash: dbAgent.config.api_key_hash,
          apiEndpoint: dbAgent.config.api_endpoint,
          authMethod: dbAgent.config.auth_method as any,
        },
        parameters: dbAgent.config.parameters as any,
        tools: dbAgent.tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters_schema as any,
          hash: t.tool_hash,
        })) as any,
      },
      metadata: {
        displayName: dbAgent.metadata.display_name,
        avatar: dbAgent.metadata.avatar_url,
        bio: dbAgent.metadata.bio,
        tags: dbAgent.metadata.tags,
        socialLinks: {
          twitter: dbAgent.metadata.social_twitter,
          github: dbAgent.metadata.social_github,
          website: dbAgent.metadata.social_website,
        },
        updatedAt: dbAgent.metadata.updated_at.toISOString(),
      },
      createdAt: dbAgent.identity.created_at,
      validatedAt: dbAgent.identity.validated_at,
      suspendedAt: dbAgent.identity.suspended_at,
      revokedAt: dbAgent.identity.revoked_at,
    };
  }

  /**
   * Get storage statistics
   */
  async getStats(): Promise<{
    registrations: number;
    identities: number;
    byStatus: Record<string, number>;
    usingDatabase: boolean;
  }> {
    const byStatus: Record<string, number> = {};

    if (this.dbAvailable) {
      try {
        const agentRepo = getAgentRepository();
        const dbStats = await agentRepo.getStats();

        return {
          registrations: this.registrations.size,
          identities: dbStats.total,
          byStatus: dbStats.byStatus,
          usingDatabase: true,
        };
      } catch (error) {
        logger.error({ error }, 'Failed to get stats from database');
      }
    }

    // Fallback to memory stats
    for (const identity of this.identities.values()) {
      byStatus[identity.status] = (byStatus[identity.status] || 0) + 1;
    }

    return {
      registrations: this.registrations.size,
      identities: this.identities.size,
      byStatus,
      usingDatabase: false,
    };
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let agentStorageInstance: AgentStorageService | null = null;

export function getAgentStorageService(): AgentStorageService {
  if (!agentStorageInstance) {
    agentStorageInstance = new AgentStorageService();
  }
  return agentStorageInstance;
}

export function resetAgentStorageService(): void {
  agentStorageInstance = null;
}
