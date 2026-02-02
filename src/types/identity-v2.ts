/**
 * AgentID - Identity Types V2
 *
 * Three distinct identity types for different use cases:
 * - Attestation: Human or agent declares an agent exists (DEFAULT)
 * - Fingerprint: Technical config hash for open/self-hosted agents
 * - SelfClaim: Autonomous agent registers itself
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
  /** EIP-191 wallet signature */
  HUMAN_WALLET = 'human_wallet',
  /** Twitter verification proof */
  TWITTER_PROOF = 'twitter_proof',
  /** Ed25519 agent keypair */
  AGENT_KEYPAIR = 'agent_keypair',
  /** No signature (rate-limited, lower trust) */
  NONE = 'none',
}

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
  /** Human or agent declares an agent exists - DEFAULT, minimal friction */
  ATTESTATION = 'attestation',
  /** Technical config fingerprint for open/self-hosted agents */
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
// TYPE B: FINGERPRINT IDENTITY
// =============================================================================

/**
 * Fingerprint Identity - Technical config hash for verifiable agents.
 *
 * Use cases:
 * - Open source agents
 * - Self-hosted agents
 * - Agents where you control and can share the config
 *
 * What it proves:
 * - The agent has a specific configuration
 * - Configuration can be verified by recomputing the hash
 *
 * What it does NOT prove:
 * - Agent actually uses this config at runtime
 * - Config hasn't changed since registration
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

export type AgentIdentity = AttestationIdentity | FingerprintIdentity | SelfClaimIdentity;

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

  /** On-chain anchor info */
  anchor?: {
    txHash: string;
    blockNumber: number;
    chain: string;
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

  /** Trust score (0-1) based on verifications */
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

export function isFingerprint(identity: AgentIdentity): identity is FingerprintIdentity {
  return identity.identityType === IdentityType.FINGERPRINT;
}

export function isSelfClaim(identity: AgentIdentity): identity is SelfClaimIdentity {
  return identity.identityType === IdentityType.SELF_CLAIM;
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
      [SignatureType.NONE]: 'Unverified attestation',
    },
    [IdentityType.FINGERPRINT]: {
      [SignatureType.HUMAN_WALLET]: 'Config fingerprint signed by wallet',
      [SignatureType.TWITTER_PROOF]: 'Config fingerprint linked to Twitter',
      [SignatureType.AGENT_KEYPAIR]: 'Config fingerprint signed by agent',
      [SignatureType.NONE]: 'Unverified config fingerprint',
    },
    [IdentityType.SELF_CLAIM]: {
      [SignatureType.HUMAN_WALLET]: 'Self-claim (unusual)',
      [SignatureType.TWITTER_PROOF]: 'Self-claim with Twitter',
      [SignatureType.AGENT_KEYPAIR]: 'Autonomous agent self-registered',
      [SignatureType.NONE]: 'Unverified self-claim',
    },
  };

  return descriptions[identity.identityType]?.[identity.signature.type] || 'Unknown claim type';
}
