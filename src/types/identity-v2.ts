/**
 * AgentID - Identity Types V1.1
 *
 * Two primary identity types for different use cases:
 * - ConfigIdentity: Technical config hash for open/self-hosted agents (REQUIRES wallet)
 * - AttestationIdentity: Declaration for closed platforms (ChatGPT, etc.)
 *
 * Legacy type kept for backwards compatibility:
 * - SelfClaim: Autonomous agent registers itself (deprecated, use ConfigIdentity with AGENT_KEYPAIR)
 *
 * V1.1 Changes:
 * - Renamed FINGERPRINT to CONFIG for clarity
 * - Added verified/verificationSource fields
 * - Unsigned registrations are now rejected
 * - Trust scores: 0.1 unverified → 0.3 keypair → 0.5 wallet
 */

// =============================================================================
// ISSUER TYPES
// =============================================================================

export enum IssuerType {
  HUMAN = 'human',
  AGENT = 'agent',
  SYSTEM = 'system',
}

// =============================================================================
// SIGNATURE TYPES
// =============================================================================

export enum SignatureType {
  /** EIP-191 wallet signature - highest trust */
  HUMAN_WALLET = 'human_wallet',
  /** Twitter verification proof */
  TWITTER_PROOF = 'twitter_proof',
  /** Ed25519 agent keypair - medium trust */
  AGENT_KEYPAIR = 'agent_keypair',
  /**
   * No signature - DEPRECATED in V1.1
   * Registration now requires a valid signature.
   * This value is kept for backwards compatibility with existing records only.
   * @deprecated Use HUMAN_WALLET or AGENT_KEYPAIR instead
   */
  NONE = 'none',
}

/** Valid signature types for new registrations (excludes NONE) */
export const VALID_REGISTRATION_SIGNATURES = [
  SignatureType.HUMAN_WALLET,
  SignatureType.AGENT_KEYPAIR,
  SignatureType.TWITTER_PROOF,
] as const;

export interface Signature {
  type: SignatureType;
  value: string;
  publicKey?: string; // For AGENT_KEYPAIR
  timestamp: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// IDENTITY TYPES
// =============================================================================

export enum IdentityType {
  /** Human or agent declares an agent exists - for closed platforms */
  ATTESTATION = 'attestation',
  /** Technical config hash for open/self-hosted agents - REQUIRES wallet signature */
  CONFIG = 'config',
  /**
   * @deprecated Use CONFIG with AGENT_KEYPAIR signature instead
   * Kept for backwards compatibility
   */
  FINGERPRINT = 'fingerprint',
  /** Autonomous agent self-registers with its own keypair */
  SELF_CLAIM = 'self_claim',
}

// =============================================================================
// TYPE A: ATTESTATION IDENTITY (DEFAULT)
// =============================================================================

/**
 * Attestation Identity - The default, lowest friction identity type.
 *
 * Use cases:
 * - ChatGPT Store agents
 * - SaaS bots
 * - Any agent where config is not accessible
 * - Human declaring they control/represent an agent
 *
 * What it proves:
 * - Someone (human or agent) claims this agent exists
 * - The issuer controlled the signing method at registration time
 *
 * What it does NOT prove:
 * - Agent's actual behavior
 * - Agent's internal configuration
 * - Continued control by issuer
 */
export interface AttestationIdentity {
  identityType: IdentityType.ATTESTATION;

  /** Hash of the attestation payload */
  identityHash: string;

  /** Human-readable name for the agent */
  agentName: string;

  /** Platform where agent operates (e.g., "chatgpt", "discord", "telegram", "custom") */
  platform: string;

  /** Public reference - URL, handle, or ID on the platform */
  publicReference: string;

  /** What the agent claims to do */
  declaredCapabilities: string[];

  /** Who is making this claim */
  issuerType: IssuerType;

  /** Primary signature proving issuer identity */
  signature: Signature;

  /** When the attestation was created */
  issuedAt: string;

  /** Optional description */
  description?: string;

  /** Optional tags for discovery */
  tags?: string[];
}

// =============================================================================
// TYPE B: CONFIG IDENTITY (formerly FINGERPRINT)
// =============================================================================

/**
 * Config Identity - Technical config hash for verifiable agents.
 * This is the RECOMMENDED identity type for open/self-hosted agents.
 *
 * V1.1 REQUIREMENT: Must have wallet signature (HUMAN_WALLET or AGENT_KEYPAIR)
 *
 * Use cases:
 * - Open source agents
 * - Self-hosted agents
 * - Agents where you control and can share the config
 *
 * What it proves:
 * - The agent has a specific configuration
 * - Configuration can be verified by recomputing the hash
 * - Owner controlled a wallet at registration time
 *
 * What it does NOT prove:
 * - Agent actually uses this config at runtime
 * - Config hasn't changed since registration
 */
export interface ConfigIdentity {
  identityType: IdentityType.CONFIG;

  /** SHA-256 hash of canonical config */
  identityHash: string;

  /** Human-readable name */
  agentName: string;

  /** Model information */
  model: {
    provider: string;
    modelId: string;
  };

  /** Version of the agent config */
  version?: string;

  /** System prompt (optional - will be hashed) */
  systemPromptHash?: string;

  /** Whether full config is stored (opt-in) */
  configStored: boolean;

  /** Full config if stored */
  config?: {
    systemPrompt?: string;
    parameters?: Record<string, unknown>;
    tools?: Array<{ name: string; description: string }>;
  };

  /** Who created this identity - V1.1 requires HUMAN or AGENT with valid signature */
  issuerType: IssuerType;

  /** Signature - V1.1 REQUIRES HUMAN_WALLET or AGENT_KEYPAIR */
  signature: Signature;

  /** Creation timestamp */
  issuedAt: string;

  /** Optional description */
  description?: string;

  /** Optional capabilities list */
  capabilities?: string[];
}

/**
 * @deprecated Use ConfigIdentity instead
 * Kept for backwards compatibility with existing records
 */
export interface FingerprintIdentity {
  identityType: IdentityType.FINGERPRINT;

  /** SHA-256 hash of canonical config */
  identityHash: string;

  /** Human-readable name */
  agentName: string;

  /** Model information */
  model: {
    provider: string;
    modelId: string;
  };

  /** System prompt (optional - will be hashed) */
  systemPromptHash?: string;

  /** Whether full config is stored (opt-in) */
  configStored: boolean;

  /** Full config if stored */
  config?: {
    systemPrompt?: string;
    parameters?: Record<string, unknown>;
    tools?: Array<{ name: string; description: string }>;
  };

  /** Who created this fingerprint */
  issuerType: IssuerType;

  /** Signature */
  signature: Signature;

  /** Creation timestamp */
  issuedAt: string;
}

// =============================================================================
// TYPE C: SELF-CLAIM IDENTITY
// =============================================================================

/**
 * Self-Claim Identity - Autonomous agent registers itself.
 *
 * Use cases:
 * - Truly autonomous agents
 * - Agents that manage their own identity
 * - Agent-to-agent trust networks
 *
 * What it proves:
 * - An agent with this keypair exists
 * - The agent can sign messages
 *
 * What it does NOT prove:
 * - Agent's capabilities
 * - Agent's behavior
 * - Who controls the agent
 *
 * NO Twitter or human wallet required.
 */
export interface SelfClaimIdentity {
  identityType: IdentityType.SELF_CLAIM;

  /** Hash derived from agent's public key */
  identityHash: string;

  /** Agent's self-declared name */
  agentName: string;

  /** Agent's Ed25519 public key (base64) */
  publicKey: string;

  /** What the agent claims about itself */
  declaredCapabilities: string[];

  /** Agent's signature over the claim */
  signature: Signature;

  /** Self-registration timestamp */
  issuedAt: string;

  /** Optional: Agent's endpoint for communication */
  endpoint?: string;

  /** Optional: Proof of work nonce (anti-spam) */
  proofOfWork?: {
    nonce: string;
    difficulty: number;
  };
}

// =============================================================================
// UNION TYPE
// =============================================================================

/** Primary identity types for V1.1+ */
export type AgentIdentity = AttestationIdentity | ConfigIdentity | FingerprintIdentity | SelfClaimIdentity;

/** Modern identity types only (excludes deprecated) */
export type ModernAgentIdentity = AttestationIdentity | ConfigIdentity;

// =============================================================================
// VERIFICATION STATUS (V1.1)
// =============================================================================

/**
 * Where the identity verification was confirmed
 * - 'chain': Verified on blockchain (source of truth)
 * - 'pending': Submitted but not yet confirmed on chain
 * - 'failed': Blockchain verification failed
 * - 'offchain': Only verified off-chain (legacy/lower trust)
 */
export type VerificationSource = 'chain' | 'pending' | 'failed' | 'offchain';

/**
 * V1.1 Verification status fields
 */
export interface VerificationStatus {
  /** Whether the identity is verified */
  verified: boolean;
  /** Where/how the verification was confirmed */
  verificationSource: VerificationSource;
  /** Transaction hash if verified on chain */
  txHash?: string;
  /** Block number if verified on chain */
  blockNumber?: number;
  /** When verification status was last updated */
  verifiedAt?: string;
}

// =============================================================================
// IDENTITY STATUS
// =============================================================================

export enum ClaimStatus {
  /** Claim is active and valid */
  ACTIVE = 'active',
  /** Claim has been revoked by issuer */
  REVOKED = 'revoked',
  /** Claim has been superseded by a new version */
  SUPERSEDED = 'superseded',
  /** Claim is disputed */
  DISPUTED = 'disputed',
}

// =============================================================================
// STORED IDENTITY (includes metadata)
// =============================================================================

export interface StoredIdentityV2 {
  /** Database ID */
  id: string;

  /** The identity data */
  identity: AgentIdentity;

  /** Current status */
  status: ClaimStatus;

  // ==========================================================================
  // V1.1 VERIFICATION FIELDS
  // ==========================================================================

  /** Whether identity is verified - V1.1 required field */
  verified: boolean;

  /** Where verification was confirmed - V1.1 required field */
  verificationSource: VerificationSource;

  // ==========================================================================
  // ON-CHAIN ANCHOR
  // ==========================================================================

  /** On-chain anchor info (when verificationSource === 'chain') */
  anchor?: {
    txHash: string;
    blockNumber: number;
    chain: string;
    chainId: number;
    anchoredAt: string;
  };

  /** Linked verifications (Twitter, etc.) */
  verifications?: {
    twitter?: {
      handle: string;
      userId: string;
      verifiedAt: string;
      proofUrl: string;
    };
  };

  /**
   * Trust score (0-1) based on signature type and verification
   *
   * V1.1 Trust Score Calculation:
   * - 0.1: Legacy unverified (SignatureType.NONE) - no longer allowed for new registrations
   * - 0.3: Agent keypair (AGENT_KEYPAIR) - agent can prove it controls a key
   * - 0.5: Wallet signed (HUMAN_WALLET) - human proved wallet control at registration
   * - 0.7: Wallet + on-chain anchored
   * - 0.8: Wallet + on-chain + Twitter verified
   * - 1.0: Reserved for future multi-factor verification
   */
  trustScore: number;

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;

  /** Version for updates */
  version: number;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

export function isAttestation(identity: AgentIdentity): identity is AttestationIdentity {
  return identity.identityType === IdentityType.ATTESTATION;
}

export function isConfig(identity: AgentIdentity): identity is ConfigIdentity {
  return identity.identityType === IdentityType.CONFIG;
}

/** @deprecated Use isConfig instead */
export function isFingerprint(identity: AgentIdentity): identity is FingerprintIdentity {
  return identity.identityType === IdentityType.FINGERPRINT;
}

export function isSelfClaim(identity: AgentIdentity): identity is SelfClaimIdentity {
  return identity.identityType === IdentityType.SELF_CLAIM;
}

/**
 * Check if signature type is valid for new registrations (V1.1+)
 */
export function isValidRegistrationSignature(type: SignatureType): boolean {
  return VALID_REGISTRATION_SIGNATURES.includes(type as typeof VALID_REGISTRATION_SIGNATURES[number]);
}

/**
 * Calculate trust score based on signature type and verification status
 * V1.1 Trust Score Rules:
 * - 0.1: Legacy unverified (NONE) - deprecated
 * - 0.3: Agent keypair
 * - 0.5: Human wallet
 * - 0.7: Wallet + on-chain
 * - 0.8: Wallet + on-chain + Twitter
 */
export function calculateTrustScore(
  signatureType: SignatureType,
  verificationSource: VerificationSource,
  hasTwitter: boolean = false
): number {
  // Base scores by signature type
  let score: number;
  switch (signatureType) {
    case SignatureType.HUMAN_WALLET:
      score = 0.5;
      break;
    case SignatureType.AGENT_KEYPAIR:
      score = 0.3;
      break;
    case SignatureType.TWITTER_PROOF:
      score = 0.4;
      break;
    case SignatureType.NONE:
    default:
      score = 0.1;
      break;
  }

  // Bonus for on-chain verification
  if (verificationSource === 'chain') {
    score = Math.min(score + 0.2, 0.9);
  }

  // Bonus for Twitter verification
  if (hasTwitter) {
    score = Math.min(score + 0.1, 0.9);
  }

  return Math.round(score * 10) / 10; // Round to 1 decimal
}

/**
 * Get trust level description based on identity type and signature
 */
export function getTrustDescription(identity: AgentIdentity): string {
  const descriptions: Record<IdentityType, Record<SignatureType, string>> = {
    [IdentityType.ATTESTATION]: {
      [SignatureType.HUMAN_WALLET]: 'Attested by wallet holder',
      [SignatureType.TWITTER_PROOF]: 'Attested by Twitter account holder',
      [SignatureType.AGENT_KEYPAIR]: 'Attested by another agent',
      [SignatureType.NONE]: 'Unverified attestation (legacy)',
    },
    [IdentityType.CONFIG]: {
      [SignatureType.HUMAN_WALLET]: 'Config identity verified by wallet',
      [SignatureType.TWITTER_PROOF]: 'Config identity linked to Twitter',
      [SignatureType.AGENT_KEYPAIR]: 'Config identity signed by agent',
      [SignatureType.NONE]: 'Unverified config (legacy)',
    },
    [IdentityType.FINGERPRINT]: {
      [SignatureType.HUMAN_WALLET]: 'Config fingerprint signed by wallet (legacy)',
      [SignatureType.TWITTER_PROOF]: 'Config fingerprint linked to Twitter (legacy)',
      [SignatureType.AGENT_KEYPAIR]: 'Config fingerprint signed by agent (legacy)',
      [SignatureType.NONE]: 'Unverified config fingerprint (legacy)',
    },
    [IdentityType.SELF_CLAIM]: {
      [SignatureType.HUMAN_WALLET]: 'Self-claim with wallet',
      [SignatureType.TWITTER_PROOF]: 'Self-claim with Twitter',
      [SignatureType.AGENT_KEYPAIR]: 'Autonomous agent self-registered',
      [SignatureType.NONE]: 'Unverified self-claim (legacy)',
    },
  };

  return descriptions[identity.identityType]?.[identity.signature.type] || 'Unknown identity type';
}

/**
 * Get human-readable verification status message
 */
export function getVerificationMessage(stored: StoredIdentityV2): string {
  // Check verificationSource first for specific messages
  switch (stored.verificationSource) {
    case 'chain':
      return `Verified on-chain (Block #${stored.anchor?.blockNumber || 'unknown'})`;
    case 'pending':
      return 'Verification pending (awaiting blockchain confirmation)';
    case 'failed':
      return 'Verification failed';
    case 'offchain':
      return stored.verified ? 'Verified off-chain only' : 'Not verified';
    default:
      return stored.verified ? 'Verified' : 'Not verified';
  }
}
