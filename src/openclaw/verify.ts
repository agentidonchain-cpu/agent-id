/**
 * OpenClaw Agent ID - Verification
 *
 * Verifies that a local OpenClaw agent matches a registered Agent ID.
 *
 * Flow:
 * 1. Rebuild manifest from local agent
 * 2. Canonicalize the manifest
 * 3. Recalculate fingerprint
 * 4. Compare with registered Agent ID
 *
 * Result:
 * - MATCH: "This OpenClaw agent corresponds to this Agent ID"
 * - MISMATCH: "Agent was altered or is a different agent"
 */

import type { OpenClawManifest, OpenClawAgentId, VerificationResult } from './types.js';
import { fingerprint, normalizeFingerprint, isValidFingerprint } from './fingerprint.js';
import { validateManifest } from './canonical.js';

// =============================================================================
// VERIFICATION
// =============================================================================

/**
 * Verify that a manifest matches a registered Agent ID.
 *
 * @param manifest - The local manifest to verify
 * @param agentId - The registered Agent ID
 * @returns Verification result
 */
export function verify(
  manifest: OpenClawManifest,
  agentId: OpenClawAgentId
): VerificationResult {
  // Validate inputs
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    return {
      match: false,
      computed_fingerprint: '',
      registered_fingerprint: agentId.fingerprint,
      message: `Invalid manifest: ${validation.errors.join(', ')}`,
    };
  }

  if (!isValidFingerprint(agentId.fingerprint)) {
    return {
      match: false,
      computed_fingerprint: '',
      registered_fingerprint: agentId.fingerprint,
      message: 'Invalid registered fingerprint format',
    };
  }

  // Compute fingerprint from local manifest
  const computedFingerprint = fingerprint(manifest);
  const registeredFingerprint = normalizeFingerprint(agentId.fingerprint);

  // Compare
  const match = computedFingerprint === registeredFingerprint;

  return {
    match,
    computed_fingerprint: computedFingerprint,
    registered_fingerprint: registeredFingerprint,
    message: match
      ? 'MATCH: This OpenClaw agent corresponds to this Agent ID'
      : 'MISMATCH: Agent was altered or is a different agent',
  };
}

/**
 * Verify a manifest against a fingerprint string directly.
 *
 * @param manifest - The local manifest to verify
 * @param registeredFingerprint - The fingerprint to compare against
 * @returns Verification result
 */
export function verifyAgainstFingerprint(
  manifest: OpenClawManifest,
  registeredFingerprint: string
): VerificationResult {
  // Validate manifest
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    return {
      match: false,
      computed_fingerprint: '',
      registered_fingerprint: registeredFingerprint,
      message: `Invalid manifest: ${validation.errors.join(', ')}`,
    };
  }

  if (!isValidFingerprint(registeredFingerprint)) {
    return {
      match: false,
      computed_fingerprint: '',
      registered_fingerprint: registeredFingerprint,
      message: 'Invalid fingerprint format',
    };
  }

  // Compute and compare
  const computedFingerprint = fingerprint(manifest);
  const normalizedRegistered = normalizeFingerprint(registeredFingerprint);

  const match = computedFingerprint === normalizedRegistered;

  return {
    match,
    computed_fingerprint: computedFingerprint,
    registered_fingerprint: normalizedRegistered,
    message: match
      ? 'MATCH: This OpenClaw agent corresponds to this Agent ID'
      : 'MISMATCH: Agent was altered or is a different agent',
  };
}
