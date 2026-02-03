/**
 * OpenClaw Agent ID - Registry
 *
 * Simple storage for registered Agent IDs.
 *
 * Stores ONLY:
 * - type: "openclaw"
 * - fingerprint: bytes32
 * - schema: "openclaw-manifest-v1"
 * - created_at: timestamp
 * - manifest_ref (optional): IPFS/URL reference
 *
 * Does NOT store:
 * - Owner
 * - Wallet
 * - Signature
 * - Auth data
 * - Permissions
 */

import type { OpenClawAgentId, OpenClawManifest } from './types.js';
import { fingerprint } from './fingerprint.js';
import { validateManifest } from './canonical.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// IN-MEMORY REGISTRY (can be replaced with DB)
// =============================================================================

const registry = new Map<string, OpenClawAgentId>();

// =============================================================================
// REGISTRY OPERATIONS
// =============================================================================

/**
 * Register a new Agent ID from a manifest.
 *
 * NO wallet required.
 * NO signature required.
 * NO auth required.
 *
 * @param manifest - The manifest to register
 * @param manifestRef - Optional reference to full manifest (IPFS, URL)
 * @returns The registered Agent ID
 */
export function register(
  manifest: OpenClawManifest,
  manifestRef?: string
): { agentId: OpenClawAgentId; created: boolean } {
  // Validate manifest
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Invalid manifest: ${validation.errors.join(', ')}`);
  }

  // Generate fingerprint
  const fp = fingerprint(manifest);

  // Check if already registered (IDEMPOTENT)
  if (registry.has(fp)) {
    logger.info({ fingerprint: fp }, 'Agent ID already registered (returning existing)');
    return { agentId: registry.get(fp)!, created: false };
  }

  // Create Agent ID
  const agentId: OpenClawAgentId = {
    type: 'openclaw',
    fingerprint: fp,
    schema: 'openclaw-manifest-v1',
    created_at: new Date().toISOString(),
    manifest_ref: manifestRef,
  };

  // Store
  registry.set(fp, agentId);

  logger.info({ fingerprint: fp }, 'Agent ID registered (new)');

  return { agentId, created: true };
}

/**
 * Get a registered Agent ID by fingerprint.
 *
 * @param fp - The fingerprint to look up
 * @returns The Agent ID if found, null otherwise
 */
export function get(fp: string): OpenClawAgentId | null {
  const normalized = fp.toLowerCase();
  return registry.get(normalized) || null;
}

/**
 * Check if a fingerprint is registered.
 *
 * @param fp - The fingerprint to check
 * @returns true if registered
 */
export function exists(fp: string): boolean {
  return registry.has(fp.toLowerCase());
}

/**
 * List all registered Agent IDs.
 *
 * @param limit - Max number to return (default 100)
 * @param offset - Offset for pagination (default 0)
 * @returns Array of Agent IDs
 */
export function list(limit = 100, offset = 0): OpenClawAgentId[] {
  const all = Array.from(registry.values());
  return all.slice(offset, offset + limit);
}

/**
 * Get total count of registered Agent IDs.
 */
export function count(): number {
  return registry.size;
}

// =============================================================================
// EXPORT REGISTRY INTERFACE
// =============================================================================

export const openclawRegistry = {
  register,
  get,
  exists,
  list,
  count,
};

export default openclawRegistry;
