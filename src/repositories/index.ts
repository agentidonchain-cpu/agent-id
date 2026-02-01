/**
 * Agent007 - Repository Index
 *
 * Central export point for all repository classes.
 */

// Agent Repository
export {
  AgentRepository,
  getAgentRepository,
  type AgentIdentityRow,
  type AgentCoreConfigRow,
  type AgentMetadataRow,
  type AgentToolRow,
  type AgentWithDetails,
} from './agents.js';

// Verification Repository
export {
  VerificationRepository,
  getVerificationRepository,
  type VerificationResultRow,
  type BehavioralFingerprintRow,
  type AutonomyAnalysisRow,
  type AlertRow,
} from './verification.js';

// Creator Repository
export {
  CreatorRepository,
  getCreatorRepository,
  type CreatorRow,
  type CreateCreatorInput,
} from './creators.js';

// Attestation Repository
export {
  AttestationRepository,
  getAttestationRepository,
  type AttestationType,
  type TrustLevel,
  type AttestationRow,
  type ProxyLogRow,
  type CreateAttestationInput,
  type CreateProxyLogInput,
} from './attestations.js';

// Audit Log Repository
export {
  AuditLogRepository,
  getAuditLogRepository,
  type ActorType,
  type EntityType,
  type AuditLogRow,
  type CreateAuditLogInput,
  type AuditLogFilter,
} from './audit.js';
