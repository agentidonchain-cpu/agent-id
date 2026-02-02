/**
 * @agentid/runtime-sdk
 * Type definitions for Runtime Attestation Protocol
 */

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Configuration for the RuntimeAttestor
 */
export interface AttestorConfig {
  /** Agent's registered identity hash */
  identityHash: string;

  /** Ed25519 private key (hex string, 64 chars) */
  privateKey: string;

  /** Ed25519 public key (hex string, 64 chars) */
  publicKey: string;

  /** API base URL (default: https://api.id-agent.org) */
  apiUrl?: string;

  /** Function to get current agent configuration */
  getConfig: () => AgentConfig | Promise<AgentConfig>;

  /** Optional: Port for challenge listener webhook */
  listenerPort?: number;

  /** Optional: Enable auto self-verification interval (ms) */
  selfVerifyInterval?: number;
}

/**
 * Agent configuration for hashing
 */
export interface AgentConfig {
  /** Full configuration object or JSON string */
  fullConfig: string | object;

  /** System prompt / character definition */
  systemPrompt?: string;

  /** List of enabled tool names */
  tools?: string[];

  /** Model information */
  model?: {
    name: string;
    version?: string;
    endpoint?: string;
  };

  /** Optional: Agent version string */
  version?: string;

  /** Optional: Platform identifier */
  platform?: string;
}

// =============================================================================
// CHALLENGE & ATTESTATION
// =============================================================================

/**
 * Challenge received from the API
 */
export interface Challenge {
  challengeId: string;
  nonce: string;
  expiresAt: string;
  targetIdentityHash: string;
}

/**
 * Runtime configuration hashes
 */
export interface RuntimeHashes {
  configHash: string;
  systemPromptHash: string;
  toolsHash: string;
  modelFingerprint: string;
}

/**
 * Runtime snapshot for attestation
 */
export interface RuntimeSnapshot {
  hashes: RuntimeHashes;
  timestamp: string;
  agentVersion?: string;
  platform?: string;
  uptimeSeconds?: number;
}

/**
 * Cryptographic proof
 */
export interface AttestationProof {
  type: 'ed25519';
  signature: string;
  publicKey: string;
}

/**
 * Complete runtime attestation
 */
export interface RuntimeAttestation {
  registeredIdentityHash: string;
  runtime: RuntimeSnapshot;
  challenge: {
    challengeId: string;
    nonce: string;
    challengedAt: string;
    respondedAt: string;
  };
  proof: AttestationProof;
}

// =============================================================================
// RESPONSES
// =============================================================================

/**
 * Drift detection result
 */
export interface DriftReport {
  configMatch: boolean;
  systemPromptMatch: boolean;
  toolsMatch: boolean;
  modelMatch: boolean;
  overallMatch: boolean;
  driftScore: number;
}

/**
 * Attestation verification result
 */
export interface AttestationResult {
  success: boolean;
  verified?: boolean;
  drift?: DriftReport;
  warnings?: string[];
  error?: string;
}

/**
 * Attestation status
 */
export interface AttestationStatus {
  identityHash: string;
  hasAttested: boolean;
  lastAttestedAt?: string;
  lastDriftScore?: number;
  isLive: boolean;
  attestationCount: number;
  trustBonus: number;
}

// =============================================================================
// EVENTS
// =============================================================================

/**
 * Event types emitted by the attestor
 */
export type AttestorEvent =
  | { type: 'challenge_received'; challenge: Challenge }
  | { type: 'attestation_sent'; challengeId: string }
  | { type: 'attestation_verified'; result: AttestationResult }
  | { type: 'attestation_failed'; error: string }
  | { type: 'self_verify_complete'; drift: DriftReport }
  | { type: 'error'; error: string };

/**
 * Event handler type
 */
export type EventHandler = (event: AttestorEvent) => void;
