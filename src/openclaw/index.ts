/**
 * OpenClaw Agent ID
 *
 * Agent ID = birth certificate, NOT ownership, NOT auth.
 *
 * This module provides:
 * - Manifest schema (OpenClawManifest)
 * - Canonicalization (deterministic JSON)
 * - Fingerprint generation (SHA256)
 * - Verification (compare fingerprints)
 * - Registry (store/retrieve Agent IDs)
 * - API routes (REST endpoints)
 *
 * Usage:
 *
 * ```typescript
 * import { fingerprint, verify, openclawRegistry } from './openclaw';
 *
 * // Create manifest
 * const manifest = {
 *   schema_version: 'openclaw-manifest-v1',
 *   agent_name: 'MyAgent',
 *   agent_description: 'A helpful agent',
 *   agent_role: 'assistant',
 *   skills: [{ name: 'chat', version: '1.0' }]
 * };
 *
 * // Generate fingerprint (no server needed)
 * const fp = fingerprint(manifest);
 * console.log(fp); // 0x...
 *
 * // Register (stores in registry)
 * const agentId = openclawRegistry.register(manifest);
 *
 * // Verify later
 * const result = verify(manifest, agentId);
 * console.log(result.match); // true
 * ```
 */

// Types
export type {
  OpenClawManifest,
  OpenClawSkill,
  OpenClawAgentId,
  VerificationResult,
} from './types.js';

// Canonicalization
export { canonicalize, validateManifest, normalizeSkillName } from './canonical.js';

// Fingerprint
export {
  fingerprint,
  fingerprintRaw,
  verifyFingerprint,
  isValidFingerprint,
  normalizeFingerprint,
} from './fingerprint.js';

// Verification
export { verify, verifyAgainstFingerprint } from './verify.js';

// Registry
export { openclawRegistry } from './registry.js';

// Routes
export { default as openclawRoutes } from './routes.js';
