/**
 * OpenClaw Agent ID - Registry
 *
 * ON-CHAIN FIRST: "Registered" = on-chain TX mined. Nothing else.
 *
 * This registry serves as a LOCAL CACHE only:
 * - Caches manifest data for convenience
 * - Tracks which fingerprints are registered on-chain
 * - Does NOT replace blockchain as source of truth
 *
 * Two types of entries:
 * 1. CACHED: Manifest prepared but NOT registered (no blockchain proof)
 * 2. REGISTERED: On-chain TX mined (has transactionHash + blockNumber)
 */

import type { OpenClawAgentId, OpenClawManifest } from './types.js';
import { fingerprint } from './fingerprint.js';
import { validateManifest, canonicalize } from './canonical.js';
import { logger } from '../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

interface CachedEntry {
  type: 'cached';
  fingerprint: string;
  manifest?: OpenClawManifest;
  manifestRef?: string;
  cachedAt: string;
}

interface RegisteredEntry {
  type: 'registered';
  fingerprint: string;
  manifest?: OpenClawManifest;
  manifestRef?: string;
  cachedAt: string;
  // ON-CHAIN PROOF (required for 'registered')
  transactionHash: string;
  blockNumber: number;
  registeredAt: string;
}

type RegistryEntry = CachedEntry | RegisteredEntry;

// =============================================================================
// IN-MEMORY REGISTRY
// =============================================================================

const registry = new Map<string, RegistryEntry>();

// =============================================================================
// CACHE OPERATIONS (NOT registration)
// =============================================================================

/**
 * Cache a manifest for later registration.
 * This does NOT register anything - just stores locally.
 */
export function cache(
  manifest: OpenClawManifest,
  manifestRef?: string
): { fingerprint: string; cached: boolean } {
  // Validate manifest
  const validation = validateManifest(manifest);
  if (!validation.valid) {
    throw new Error(`Invalid manifest: ${validation.errors.join(', ')}`);
  }

  const fp = fingerprint(manifest);

  // If already registered, don't overwrite
  const existing = registry.get(fp);
  if (existing?.type === 'registered') {
    logger.debug({ fingerprint: fp }, 'Manifest already registered, not caching');
    return { fingerprint: fp, cached: false };
  }

  // Cache (not registered!)
  const entry: CachedEntry = {
    type: 'cached',
    fingerprint: fp,
    manifest,
    manifestRef,
    cachedAt: new Date().toISOString(),
  };

  registry.set(fp, entry);
  logger.debug({ fingerprint: fp }, 'Manifest cached (NOT registered)');

  return { fingerprint: fp, cached: true };
}

// =============================================================================
// REGISTRATION OPERATIONS (requires blockchain proof)
// =============================================================================

/**
 * Mark a fingerprint as registered on-chain.
 * Call this ONLY after TX is mined.
 */
export function markRegistered(
  fp: string,
  proof: {
    transactionHash?: string;
    blockNumber?: number;
    manifest?: OpenClawManifest;
    manifestRef?: string;
  }
): void {
  const normalized = fp.toLowerCase();
  const existing = registry.get(normalized);

  const entry: RegisteredEntry = {
    type: 'registered',
    fingerprint: normalized,
    manifest: proof.manifest || existing?.manifest,
    manifestRef: proof.manifestRef || existing?.manifestRef,
    cachedAt: existing?.cachedAt || new Date().toISOString(),
    transactionHash: proof.transactionHash || 'unknown',
    blockNumber: proof.blockNumber || 0,
    registeredAt: new Date().toISOString(),
  };

  registry.set(normalized, entry);
  logger.info(
    { fingerprint: fp, txHash: proof.transactionHash },
    'Manifest marked as REGISTERED (on-chain)'
  );
}

/**
 * Legacy register function - now requires on-chain proof.
 * @deprecated Use cache() + markRegistered() instead
 */
export function register(
  manifest: OpenClawManifest,
  manifestRef?: string
): { agentId: OpenClawAgentId; created: boolean } {
  // Just cache, don't mark as registered
  const { fingerprint: fp } = cache(manifest, manifestRef);
  const existing = registry.get(fp);

  // Return OpenClawAgentId format for backward compatibility
  const agentId: OpenClawAgentId = {
    type: 'openclaw',
    fingerprint: fp,
    schema: 'openclaw-manifest-v1',
    created_at: existing?.cachedAt || new Date().toISOString(),
    manifest_ref: manifestRef,
  };

  // IMPORTANT: This does NOT mean it's registered on-chain!
  logger.warn(
    { fingerprint: fp },
    'Legacy register() called - manifest cached but NOT on-chain registered'
  );

  return { agentId, created: true };
}

// =============================================================================
// READ OPERATIONS
// =============================================================================

/**
 * Get a registered Agent ID by fingerprint.
 * Returns null if not found or not registered on-chain.
 */
export function get(fp: string): (OpenClawAgentId & { onChain?: boolean }) | null {
  const normalized = fp.toLowerCase();
  const entry = registry.get(normalized);

  if (!entry) {
    return null;
  }

  return {
    type: 'openclaw',
    fingerprint: entry.fingerprint,
    schema: 'openclaw-manifest-v1',
    created_at: entry.cachedAt,
    manifest_ref: entry.manifestRef,
    // Additional fields
    manifest: entry.manifest,
    onChain: entry.type === 'registered',
    transactionHash: entry.type === 'registered' ? entry.transactionHash : undefined,
    blockNumber: entry.type === 'registered' ? entry.blockNumber : undefined,
  } as OpenClawAgentId & { onChain?: boolean };
}

/**
 * Check if a fingerprint exists in cache (may or may not be on-chain).
 */
export function exists(fp: string): boolean {
  return registry.has(fp.toLowerCase());
}

/**
 * Check if a fingerprint is registered ON-CHAIN.
 */
export function isRegistered(fp: string): boolean {
  const entry = registry.get(fp.toLowerCase());
  return entry?.type === 'registered';
}

/**
 * List all entries (cached + registered).
 * @deprecated Use listRegistered() for on-chain only
 */
export function list(limit = 100, offset = 0): OpenClawAgentId[] {
  const all = Array.from(registry.values()).map(entry => ({
    type: 'openclaw' as const,
    fingerprint: entry.fingerprint,
    schema: 'openclaw-manifest-v1' as const,
    created_at: entry.cachedAt,
    manifest_ref: entry.manifestRef,
  }));
  return all.slice(offset, offset + limit);
}

/**
 * List only ON-CHAIN registered agents.
 * ON-CHAIN FIRST: This is the correct function to use.
 */
export function listRegistered(limit = 100, offset = 0): Array<{
  fingerprint: string;
  transactionHash: string;
  blockNumber: number;
  registeredAt: string;
  agentName?: string;
  manifestRef?: string;
}> {
  const registered = Array.from(registry.values())
    .filter((entry): entry is RegisteredEntry => entry.type === 'registered')
    .map(entry => ({
      fingerprint: entry.fingerprint,
      transactionHash: entry.transactionHash,
      blockNumber: entry.blockNumber,
      registeredAt: entry.registeredAt,
      agentName: entry.manifest?.agent_name,
      manifestRef: entry.manifestRef,
    }));

  return registered.slice(offset, offset + limit);
}

/**
 * Get total count (cached + registered).
 * @deprecated Use countRegistered() for on-chain only
 */
export function count(): number {
  return registry.size;
}

/**
 * Get count of ON-CHAIN registered agents only.
 * ON-CHAIN FIRST: This is the correct function to use.
 */
export function countRegistered(): number {
  return Array.from(registry.values())
    .filter(entry => entry.type === 'registered')
    .length;
}

// =============================================================================
// EXPORT REGISTRY INTERFACE
// =============================================================================

export const openclawRegistry = {
  // Cache operations (NOT registration)
  cache,
  // Registration operations (requires blockchain proof)
  markRegistered,
  isRegistered,
  // Legacy (deprecated)
  register,
  // Read operations
  get,
  exists,
  list,
  listRegistered,
  count,
  countRegistered,
};

export default openclawRegistry;
