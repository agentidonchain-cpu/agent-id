/**
 * OpenClaw Agent ID - Types
 *
 * Agent ID = birth certificate, NOT ownership, NOT auth
 *
 * This module defines the canonical schema for OpenClaw agent manifests.
 */

// =============================================================================
// MANIFEST SCHEMA v1
// =============================================================================

/**
 * OpenClaw Agent Manifest
 *
 * Contains ONLY declarative data that defines "who the agent is" at birth.
 *
 * Does NOT contain:
 * - Code
 * - Runtime state
 * - Secrets
 * - API keys
 * - Owner information
 * - Wallet addresses
 */
export interface OpenClawManifest {
  /** Schema version (required for deterministic hashing) */
  schema_version: 'openclaw-manifest-v1';

  /** Agent name */
  agent_name: string;

  /** Agent description */
  agent_description: string;

  /** Agent role or purpose */
  agent_role: string;

  /** List of skills the agent has */
  skills: OpenClawSkill[];
}

/**
 * Skill definition
 */
export interface OpenClawSkill {
  /** Skill name */
  name: string;

  /** Skill version */
  version: string;

  /** Optional skill description */
  description?: string;
}

// =============================================================================
// AGENT ID (REGISTERED IDENTITY)
// =============================================================================

/**
 * Registered Agent ID
 *
 * Contains ONLY:
 * - Type identifier
 * - Fingerprint (SHA256 of canonical manifest)
 * - Schema reference
 * - Creation timestamp
 *
 * Does NOT contain:
 * - Owner
 * - Wallet
 * - Signature
 * - Auth tokens
 * - Permissions
 */
export interface OpenClawAgentId {
  /** Identity type */
  type: 'openclaw';

  /** SHA256 fingerprint of canonical manifest (0x-prefixed, 64 hex chars) */
  fingerprint: string;

  /** Schema version used */
  schema: 'openclaw-manifest-v1';

  /** Creation timestamp (ISO 8601) */
  created_at: string;

  /** Optional: Reference to full manifest (IPFS CID, URL, etc) */
  manifest_ref?: string;
}

// =============================================================================
// VERIFICATION RESULT
// =============================================================================

/**
 * Result of verifying an agent against a registered Agent ID
 */
export interface VerificationResult {
  /** Whether the agent matches the registered identity */
  match: boolean;

  /** The fingerprint that was computed from the local manifest */
  computed_fingerprint: string;

  /** The fingerprint that was registered */
  registered_fingerprint: string;

  /** Human-readable message */
  message: string;
}
