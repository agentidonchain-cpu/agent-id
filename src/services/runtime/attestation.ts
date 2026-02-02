/**
 * AgentID - Runtime Attestation Protocol (RAP)
 * Attestation Service
 *
 * Handles verification of runtime attestations and drift detection.
 */

import { createHash } from 'crypto';
import * as nacl from 'tweetnacl';
import { logger } from '../../utils/logger.js';
import { getAgentStorageService } from '../storage/index.js';
import {
  validateChallenge,
  markChallengeVerified,
  markChallengeFailed,
} from './challenge.js';
import type {
  RuntimeAttestation,
  AttestationVerification,
  DriftReport,
  DriftMismatch,
  AttestationStatus,
  StoredAttestation,
  RegisteredRuntimeConfig,
} from '../../types/runtime.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

/** How recent an attestation must be to consider agent "live" (1 hour) */
const LIVE_THRESHOLD_MS = 60 * 60 * 1000;

/** Weights for drift score calculation */
const DRIFT_WEIGHTS = {
  config: 0.4,
  systemPrompt: 0.3,
  tools: 0.2,
  model: 0.1,
};

// =============================================================================
// IN-MEMORY STORAGE (Use database in production)
// =============================================================================

/** Stored attestations by identity hash */
const attestationHistory = new Map<string, StoredAttestation[]>();

/** Registered runtime configs (normally from identity registration) */
const registeredConfigs = new Map<string, RegisteredRuntimeConfig>();

// =============================================================================
// ATTESTATION SERVICE
// =============================================================================

/**
 * Register the expected runtime configuration for an agent
 * Called during agent registration to set baseline for drift detection
 */
export async function registerRuntimeConfig(
  identityHash: string,
  config: RegisteredRuntimeConfig
): Promise<void> {
  registeredConfigs.set(identityHash.toLowerCase(), config);

  logger.info(
    {
      identityHash: identityHash.slice(0, 10) + '...',
      configHash: config.configHash?.slice(0, 10) + '...',
    },
    'Registered runtime configuration for attestation'
  );
}

/**
 * Get registered runtime config for an agent
 */
export async function getRegisteredConfig(
  identityHash: string
): Promise<RegisteredRuntimeConfig | null> {
  // First check in-memory cache
  const cached = registeredConfigs.get(identityHash.toLowerCase());
  if (cached) {
    return cached;
  }

  // Try to get from storage (identity registration data)
  try {
    const storage = getAgentStorageService();
    const identity = await storage.getIdentity(identityHash);

    if (identity) {
      // Extract runtime config from identity
      // The identity hash itself is the config hash (hash of the entire config)
      // Individual component hashes may not be stored separately
      const config: RegisteredRuntimeConfig = {
        configHash: identityHash, // The identity hash IS the config hash
        // Component hashes - we use the main hash if individual hashes not available
        systemPromptHash: undefined, // Will match any if not set
        toolsHash: undefined,
        modelFingerprint: undefined,
        // Public key from signature if available
        attestationPublicKey: identity.ownerAddress,
        registeredAt: identity.createdAt?.toISOString() || new Date().toISOString(),
      };

      // Cache it
      registeredConfigs.set(identityHash.toLowerCase(), config);
      return config;
    }
  } catch (error) {
    logger.warn({ error, identityHash }, 'Failed to get registered config from storage');
  }

  return null;
}

/**
 * Verify the cryptographic signature of an attestation
 */
function verifySignature(attestation: RuntimeAttestation): boolean {
  try {
    const { proof, runtime, challenge } = attestation;

    if (proof.type !== 'ed25519') {
      logger.warn({ proofType: proof.type }, 'Unsupported proof type');
      return false;
    }

    // Reconstruct the signed message
    const message = JSON.stringify({
      registeredIdentityHash: attestation.registeredIdentityHash,
      runtime: runtime,
      challenge: {
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
      },
    });

    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Buffer.from(proof.signature, 'hex');
    const publicKeyBytes = Buffer.from(proof.publicKey, 'hex');

    // Verify Ed25519 signature
    const valid = nacl.sign.detached.verify(
      messageBytes,
      signatureBytes,
      publicKeyBytes
    );

    return valid;
  } catch (error) {
    logger.error({ error }, 'Signature verification failed');
    return false;
  }
}

/**
 * Detect drift between registered and runtime configuration
 */
async function detectDrift(
  attestation: RuntimeAttestation
): Promise<DriftReport> {
  const { registeredIdentityHash, runtime } = attestation;
  const registeredConfig = await getRegisteredConfig(registeredIdentityHash);

  const mismatches: DriftMismatch[] = [];
  let driftScore = 0;

  // If no registered config, assume maximum drift
  if (!registeredConfig) {
    return {
      configMatch: false,
      systemPromptMatch: false,
      toolsMatch: false,
      modelMatch: false,
      overallMatch: false,
      driftScore: 1.0,
      mismatches: [
        {
          field: 'config',
          expected: 'unknown',
          actual: runtime.hashes.configHash,
          severity: 'critical',
        },
      ],
    };
  }

  // Check config hash
  const configMatch =
    registeredConfig.configHash?.toLowerCase() ===
    runtime.hashes.configHash?.toLowerCase();

  if (!configMatch) {
    mismatches.push({
      field: 'config',
      expected: registeredConfig.configHash || 'none',
      actual: runtime.hashes.configHash,
      severity: 'critical',
    });
    driftScore += DRIFT_WEIGHTS.config;
  }

  // Check system prompt hash
  const systemPromptMatch =
    !registeredConfig.systemPromptHash ||
    registeredConfig.systemPromptHash?.toLowerCase() ===
      runtime.hashes.systemPromptHash?.toLowerCase();

  if (!systemPromptMatch) {
    mismatches.push({
      field: 'systemPrompt',
      expected: registeredConfig.systemPromptHash || 'none',
      actual: runtime.hashes.systemPromptHash,
      severity: 'high',
    });
    driftScore += DRIFT_WEIGHTS.systemPrompt;
  }

  // Check tools hash
  const toolsMatch =
    !registeredConfig.toolsHash ||
    registeredConfig.toolsHash?.toLowerCase() ===
      runtime.hashes.toolsHash?.toLowerCase();

  if (!toolsMatch) {
    mismatches.push({
      field: 'tools',
      expected: registeredConfig.toolsHash || 'none',
      actual: runtime.hashes.toolsHash,
      severity: 'high',
    });
    driftScore += DRIFT_WEIGHTS.tools;
  }

  // Check model fingerprint
  const modelMatch =
    !registeredConfig.modelFingerprint ||
    registeredConfig.modelFingerprint?.toLowerCase() ===
      runtime.hashes.modelFingerprint?.toLowerCase();

  if (!modelMatch) {
    mismatches.push({
      field: 'model',
      expected: registeredConfig.modelFingerprint || 'none',
      actual: runtime.hashes.modelFingerprint,
      severity: 'medium',
    });
    driftScore += DRIFT_WEIGHTS.model;
  }

  const overallMatch = configMatch && systemPromptMatch && toolsMatch && modelMatch;

  return {
    configMatch,
    systemPromptMatch,
    toolsMatch,
    modelMatch,
    overallMatch,
    driftScore: Math.min(driftScore, 1.0),
    mismatches,
  };
}

/**
 * Verify a runtime attestation
 */
export async function verifyAttestation(
  attestation: RuntimeAttestation
): Promise<AttestationVerification> {
  const warnings: string[] = [];
  const { challenge, registeredIdentityHash } = attestation;

  // 1. Validate the challenge
  const challengeValidation = validateChallenge(
    challenge.challengeId,
    challenge.nonce,
    registeredIdentityHash
  );

  if (!challengeValidation.valid) {
    return {
      signatureValid: false,
      challengeValid: false,
      drift: {
        configMatch: false,
        systemPromptMatch: false,
        toolsMatch: false,
        modelMatch: false,
        overallMatch: false,
        driftScore: 1.0,
        mismatches: [],
      },
      valid: false,
      warnings: [challengeValidation.error || 'Challenge validation failed'],
      verifiedAt: new Date().toISOString(),
    };
  }

  // 2. Verify cryptographic signature
  const signatureValid = verifySignature(attestation);

  if (!signatureValid) {
    markChallengeFailed(challenge.challengeId);
    return {
      signatureValid: false,
      challengeValid: true,
      drift: {
        configMatch: false,
        systemPromptMatch: false,
        toolsMatch: false,
        modelMatch: false,
        overallMatch: false,
        driftScore: 1.0,
        mismatches: [],
      },
      valid: false,
      warnings: ['Invalid cryptographic signature'],
      verifiedAt: new Date().toISOString(),
    };
  }

  // 3. Detect configuration drift
  const drift = await detectDrift(attestation);

  // Add warnings for drift
  if (drift.driftScore > 0 && drift.driftScore < 0.5) {
    warnings.push(`Minor configuration drift detected (${(drift.driftScore * 100).toFixed(1)}%)`);
  } else if (drift.driftScore >= 0.5) {
    warnings.push(`Significant configuration drift detected (${(drift.driftScore * 100).toFixed(1)}%)`);
  }

  // 4. Check response timing
  const challengedAt = new Date(challenge.challengedAt);
  const respondedAt = new Date(challenge.respondedAt);
  const responseTimeMs = respondedAt.getTime() - challengedAt.getTime();

  if (responseTimeMs > 30000) {
    warnings.push(`Slow attestation response (${(responseTimeMs / 1000).toFixed(1)}s)`);
  }

  // Mark challenge as verified
  markChallengeVerified(challenge.challengeId);

  // Store the attestation
  await storeAttestation(attestation, {
    signatureValid,
    challengeValid: true,
    drift,
    valid: true,
    warnings,
    verifiedAt: new Date().toISOString(),
  });

  logger.info(
    {
      identityHash: registeredIdentityHash.slice(0, 10) + '...',
      driftScore: drift.driftScore,
      overallMatch: drift.overallMatch,
    },
    'Runtime attestation verified successfully'
  );

  return {
    signatureValid,
    challengeValid: true,
    drift,
    valid: true,
    warnings,
    verifiedAt: new Date().toISOString(),
  };
}

/**
 * Store a verified attestation
 */
async function storeAttestation(
  attestation: RuntimeAttestation,
  verification: AttestationVerification
): Promise<void> {
  const identityHash = attestation.registeredIdentityHash.toLowerCase();

  const stored: StoredAttestation = {
    id: `att_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    identityHash,
    challengeId: attestation.challenge.challengeId,
    attestation,
    verification,
    createdAt: new Date(),
  };

  // Get or create history array
  let history = attestationHistory.get(identityHash);
  if (!history) {
    history = [];
    attestationHistory.set(identityHash, history);
  }

  // Add to history (keep last 100)
  history.unshift(stored);
  if (history.length > 100) {
    history.pop();
  }
}

/**
 * Get attestation status for an identity
 */
export async function getAttestationStatus(
  identityHash: string
): Promise<AttestationStatus> {
  const history = attestationHistory.get(identityHash.toLowerCase()) || [];

  if (history.length === 0) {
    return {
      identityHash,
      hasAttested: false,
      isLive: false,
      attestationCount: 0,
      trustBonus: 0,
    };
  }

  const latestAttestation = history[0];
  const lastAttestedAt = latestAttestation.createdAt;
  const isLive = Date.now() - lastAttestedAt.getTime() < LIVE_THRESHOLD_MS;

  // Calculate average drift score over last 24h
  const last24h = history.filter(
    (a) => Date.now() - a.createdAt.getTime() < 24 * 60 * 60 * 1000
  );

  let averageDriftScore24h: number | undefined;
  if (last24h.length > 0) {
    const totalDrift = last24h.reduce(
      (sum, a) => sum + a.verification.drift.driftScore,
      0
    );
    averageDriftScore24h = totalDrift / last24h.length;
  }

  // Calculate trust bonus based on attestation history
  let trustBonus = 0;
  if (isLive && latestAttestation.verification.drift.driftScore < 0.1) {
    trustBonus = 0.2; // Fresh attestation with no drift
  } else if (isLive) {
    trustBonus = 0.1 * (1 - latestAttestation.verification.drift.driftScore);
  }

  // Bonus for consistent attestation history
  if (history.length > 100) {
    trustBonus += 0.1;
  } else if (history.length > 10) {
    trustBonus += 0.05;
  }

  return {
    identityHash,
    hasAttested: true,
    lastAttestedAt: lastAttestedAt.toISOString(),
    lastDriftScore: latestAttestation.verification.drift.driftScore,
    isLive,
    attestationCount: history.length,
    averageDriftScore24h,
    trustBonus: Math.min(trustBonus, 0.3), // Cap at 0.3
  };
}

/**
 * Get attestation history for an identity
 */
export function getAttestationHistory(
  identityHash: string,
  limit: number = 10
): StoredAttestation[] {
  const history = attestationHistory.get(identityHash.toLowerCase()) || [];
  return history.slice(0, limit);
}

/**
 * Calculate SHA256 hash of a string
 */
export function hashString(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Generate runtime hashes from agent configuration
 * Helper for agents to create attestation payload
 */
export function generateRuntimeHashes(config: {
  fullConfig: string | object;
  systemPrompt?: string;
  tools?: string[];
  model?: { name: string; version?: string; endpoint?: string };
}): {
  configHash: string;
  systemPromptHash: string;
  toolsHash: string;
  modelFingerprint: string;
} {
  const configString =
    typeof config.fullConfig === 'string'
      ? config.fullConfig
      : JSON.stringify(config.fullConfig);

  return {
    configHash: hashString(configString),
    systemPromptHash: config.systemPrompt ? hashString(config.systemPrompt) : '',
    toolsHash: config.tools ? hashString(JSON.stringify(config.tools.sort())) : '',
    modelFingerprint: config.model
      ? hashString(`${config.model.name}:${config.model.version || ''}:${config.model.endpoint || ''}`)
      : '',
  };
}
