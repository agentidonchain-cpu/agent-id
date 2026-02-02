/**
 * @agentid/runtime-sdk
 *
 * Runtime Attestation Protocol SDK for AI agents.
 * Allows agents to prove their current configuration matches their registered identity.
 *
 * @example
 * ```typescript
 * import { RuntimeAttestor, generateKeyPair } from '@agentid/runtime-sdk';
 *
 * // Generate keys (or use existing from registration)
 * const keys = generateKeyPair();
 *
 * // Create attestor
 * const attestor = new RuntimeAttestor({
 *   identityHash: '0x...',
 *   privateKey: keys.privateKey,
 *   publicKey: keys.publicKey,
 *   getConfig: () => ({
 *     fullConfig: myConfig,
 *     systemPrompt: 'You are...',
 *     tools: ['search'],
 *     model: { name: 'gpt-4' }
 *   })
 * });
 *
 * // Self-verify periodically
 * const drift = await attestor.selfVerify();
 * console.log('Drift score:', drift.driftScore);
 * ```
 *
 * @packageDocumentation
 */

// Main class
export { RuntimeAttestor } from './attestor.js';

// Crypto utilities
export {
  generateKeyPair,
  getPublicKey,
  sign,
  verify,
  sha256,
  generateRuntimeHashes,
  createAttestationMessage,
} from './crypto.js';

// Types
export type {
  AttestorConfig,
  AgentConfig,
  Challenge,
  RuntimeHashes,
  RuntimeSnapshot,
  AttestationProof,
  RuntimeAttestation,
  DriftReport,
  AttestationResult,
  AttestationStatus,
  AttestorEvent,
  EventHandler,
} from './types.js';
