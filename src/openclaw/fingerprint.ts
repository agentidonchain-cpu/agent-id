/**
 * OpenClaw Agent ID - Fingerprint
 *
 * Generates deterministic fingerprints from OpenClaw manifests.
 *
 * fingerprint = SHA256(canonical_manifest)
 *
 * This fingerprint:
 * - Can be generated locally
 * - Does NOT require wallet
 * - Does NOT require API
 * - Does NOT require server
 */

import { createHash } from 'crypto';
import type { OpenClawManifest } from './types.js';
import { canonicalize } from './canonical.js';

// =============================================================================
// FINGERPRINT GENERATION
// =============================================================================

/**
 * Generate fingerprint from an OpenClaw manifest.
 *
 * @param manifest - The manifest to fingerprint
 * @returns 0x-prefixed SHA256 hash (66 characters total)
 */
export function fingerprint(manifest: OpenClawManifest): string {
  const canonical = canonicalize(manifest);
  const hash = createHash('sha256').update(canonical).digest('hex');
  return `0x${hash}`;
}

/**
 * Generate fingerprint from raw canonical JSON string.
 *
 * Use this if you already have the canonical form.
 *
 * @param canonicalJson - Pre-canonicalized JSON string
 * @returns 0x-prefixed SHA256 hash
 */
export function fingerprintRaw(canonicalJson: string): string {
  const hash = createHash('sha256').update(canonicalJson).digest('hex');
  return `0x${hash}`;
}

/**
 * Verify that a fingerprint matches a manifest.
 *
 * @param manifest - The manifest to check
 * @param expectedFingerprint - The expected fingerprint (0x-prefixed)
 * @returns true if match, false otherwise
 */
export function verifyFingerprint(
  manifest: OpenClawManifest,
  expectedFingerprint: string
): boolean {
  const computed = fingerprint(manifest);
  return computed.toLowerCase() === expectedFingerprint.toLowerCase();
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Check if a string is a valid fingerprint format.
 *
 * @param fp - String to check
 * @returns true if valid format
 */
export function isValidFingerprint(fp: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(fp);
}

/**
 * Normalize fingerprint to lowercase with 0x prefix.
 *
 * @param fp - Fingerprint to normalize
 * @returns Normalized fingerprint
 */
export function normalizeFingerprint(fp: string): string {
  if (!fp) throw new Error('Fingerprint is required');

  // Add 0x prefix if missing
  const prefixed = fp.startsWith('0x') ? fp : `0x${fp}`;

  // Validate format
  if (!isValidFingerprint(prefixed)) {
    throw new Error('Invalid fingerprint format');
  }

  return prefixed.toLowerCase();
}
