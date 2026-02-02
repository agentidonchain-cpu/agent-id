/**
 * AgentID - Runtime Attestation Protocol (RAP) Types
 *
 * Types for the challenge-response protocol that allows agents
 * to prove their current configuration matches their registered identity.
 */

// =============================================================================
// CHALLENGE TYPES
// =============================================================================

/**
 * Challenge issued to an agent to prove its runtime configuration
 */
export interface Challenge {
  /** Unique challenge identifier */
  id: string;

  /** Target agent's registered identity hash */
  targetIdentityHash: string;

  /** Random nonce for replay protection */
  nonce: string;

  /** When the challenge was created */
  createdAt: Date;

  /** When the challenge expires (default: 5 minutes) */
  expiresAt: Date;

  /** Optional callback URL for async response */
  callbackUrl?: string;

  /** Who issued the challenge */
  challenger: {
    type: 'anonymous' | 'agent' | 'service';
    identityHash?: string;
    serviceId?: string;
  };

  /** Challenge status */
  status: 'pending' | 'responded' | 'expired' | 'verified' | 'failed';
}

/**
 * Request to create a new challenge
 */
export interface ChallengeRequest {
  targetIdentityHash: string;
  callbackUrl?: string;
  challengerIdentityHash?: string;
}

/**
 * Response when a challenge is created
 */
export interface ChallengeResponse {
  challengeId: string;
  nonce: string;
  expiresAt: string;
  challengeUrl: string;
  targetIdentityHash: string;
}

// =============================================================================
// RUNTIME CONFIGURATION TYPES
// =============================================================================

/**
 * Hashes of the agent's current runtime configuration
 */
export interface RuntimeConfigHashes {
  /** SHA256 of the full configuration */
  configHash: string;

  /** SHA256 of the system prompt/character */
  systemPromptHash: string;

  /** SHA256 of enabled tools list */
  toolsHash: string;

  /** Model identifier (model+version+endpoint) */
  modelFingerprint: string;

  /** SHA256 of any plugins/extensions */
  pluginsHash?: string;

  /** Optional: memory/context hash for stateful agents */
  contextHash?: string;
}

/**
 * Full runtime snapshot for attestation
 */
export interface RuntimeSnapshot {
  /** Configuration hashes */
  hashes: RuntimeConfigHashes;

  /** When this snapshot was taken */
  timestamp: string;

  /** Agent's self-reported version */
  agentVersion?: string;

  /** Platform the agent is running on */
  platform?: string;

  /** Uptime in seconds */
  uptimeSeconds?: number;
}

// =============================================================================
// ATTESTATION TYPES
// =============================================================================

/**
 * Cryptographic proof types supported
 */
export type ProofType = 'ed25519' | 'secp256k1' | 'tee' | 'zkp';

/**
 * Cryptographic proof of the attestation
 */
export interface AttestationProof {
  /** Type of cryptographic proof */
  type: ProofType;

  /** Signature over (runtime + challenge) */
  signature: string;

  /** Public key that created the signature */
  publicKey: string;

  /** For TEE: attestation certificate/quote */
  certificate?: string;

  /** For ZKP: proof data */
  zkProof?: string;
}

/**
 * Drift detection results
 */
export interface DriftReport {
  /** Does current config hash match registered? */
  configMatch: boolean;

  /** Does system prompt match registered? */
  systemPromptMatch: boolean;

  /** Do tools match registered? */
  toolsMatch: boolean;

  /** Does model match registered? */
  modelMatch: boolean;

  /** Overall match result */
  overallMatch: boolean;

  /**
   * Drift score: 0.0 = perfect match, 1.0 = complete drift
   * Calculated as weighted average of mismatches
   */
  driftScore: number;

  /** Detailed mismatch information */
  mismatches: DriftMismatch[];
}

/**
 * Details about a specific configuration mismatch
 */
export interface DriftMismatch {
  /** Which field has drifted */
  field: 'config' | 'systemPrompt' | 'tools' | 'model' | 'plugins';

  /** Expected hash (from registration) */
  expected: string;

  /** Actual hash (from runtime) */
  actual: string;

  /** Severity: how critical is this drift */
  severity: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Complete runtime attestation from an agent
 */
export interface RuntimeAttestation {
  /** The registered identity hash this attestation is for */
  registeredIdentityHash: string;

  /** Current runtime configuration */
  runtime: RuntimeSnapshot;

  /** Challenge-response data (anti-replay) */
  challenge: {
    /** Challenge ID being responded to */
    challengeId: string;

    /** Nonce from the challenge */
    nonce: string;

    /** When challenge was received */
    challengedAt: string;

    /** When attestation was generated */
    respondedAt: string;
  };

  /** Cryptographic proof */
  proof: AttestationProof;

  /** Self-reported drift analysis (optional, verified by server) */
  selfReportedDrift?: DriftReport;
}

// =============================================================================
// VERIFICATION TYPES
// =============================================================================

/**
 * Result of verifying an attestation
 */
export interface AttestationVerification {
  /** Is the attestation cryptographically valid? */
  signatureValid: boolean;

  /** Is the challenge valid and not expired? */
  challengeValid: boolean;

  /** Drift analysis results */
  drift: DriftReport;

  /** Overall verification result */
  valid: boolean;

  /** Any warnings (non-fatal issues) */
  warnings: string[];

  /** Verification timestamp */
  verifiedAt: string;
}

/**
 * Attestation status for an agent
 */
export interface AttestationStatus {
  /** Agent's identity hash */
  identityHash: string;

  /** Has the agent ever attested? */
  hasAttested: boolean;

  /** Last successful attestation time */
  lastAttestedAt?: string;

  /** Last drift score (0-1) */
  lastDriftScore?: number;

  /** Is the agent considered "live" (attested recently)? */
  isLive: boolean;

  /** Total number of successful attestations */
  attestationCount: number;

  /** Average drift score over last 24h */
  averageDriftScore24h?: number;

  /** Trust bonus from attestation (0-0.3) */
  trustBonus: number;
}

// =============================================================================
// STORAGE TYPES
// =============================================================================

/**
 * Stored attestation record
 */
export interface StoredAttestation {
  id: string;
  identityHash: string;
  challengeId: string;
  attestation: RuntimeAttestation;
  verification: AttestationVerification;
  createdAt: Date;

  /** Optional: on-chain recording */
  onChain?: {
    txHash: string;
    blockNumber: number;
    recordedAt: Date;
  };
}

/**
 * Registered runtime configuration (stored at registration time)
 */
export interface RegisteredRuntimeConfig {
  /** Original config hashes at registration */
  configHash: string;
  systemPromptHash?: string;
  toolsHash?: string;
  modelFingerprint?: string;

  /** Ed25519 public key for attestation verification */
  attestationPublicKey?: string;

  /** When runtime config was registered */
  registeredAt: string;
}

// =============================================================================
// API TYPES
// =============================================================================

/**
 * Request to submit an attestation
 */
export interface AttestationRequest {
  challengeId: string;
  attestation: RuntimeAttestation;
}

/**
 * Request to verify an attestation (third-party)
 */
export interface VerifyAttestationRequest {
  attestation: RuntimeAttestation;
}

/**
 * Response from attestation verification
 */
export interface VerifyAttestationResponse {
  valid: boolean;
  drift: DriftReport;
  warnings: string[];
  registeredAt?: string;
  attestationCount?: number;
}
