/**
 * @agentid/runtime-sdk
 * Cryptographic utilities for attestation
 */

import * as nacl from 'tweetnacl';
import { createHash } from 'crypto';
import type { RuntimeHashes, AgentConfig } from './types.js';

// =============================================================================
// KEY MANAGEMENT
// =============================================================================

/**
 * Generate a new Ed25519 keypair
 */
export function generateKeyPair(): { publicKey: string; privateKey: string } {
  const keyPair = nacl.sign.keyPair();
  return {
    publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
    privateKey: Buffer.from(keyPair.secretKey).toString('hex'),
  };
}

/**
 * Get public key from private key
 */
export function getPublicKey(privateKey: string): string {
  const privateKeyBytes = Buffer.from(privateKey, 'hex');
  // Ed25519 secret key is 64 bytes, public key is last 32 bytes
  if (privateKeyBytes.length === 64) {
    return Buffer.from(privateKeyBytes.slice(32)).toString('hex');
  }
  // If only seed provided (32 bytes), generate full keypair
  const keyPair = nacl.sign.keyPair.fromSeed(privateKeyBytes);
  return Buffer.from(keyPair.publicKey).toString('hex');
}

// =============================================================================
// SIGNING
// =============================================================================

/**
 * Sign a message with Ed25519
 */
export function sign(message: string, privateKey: string): string {
  const messageBytes = new TextEncoder().encode(message);
  const privateKeyBytes = Buffer.from(privateKey, 'hex');

  // Ensure we have full secret key (64 bytes)
  let secretKey: Uint8Array;
  if (privateKeyBytes.length === 64) {
    secretKey = privateKeyBytes;
  } else if (privateKeyBytes.length === 32) {
    const keyPair = nacl.sign.keyPair.fromSeed(privateKeyBytes);
    secretKey = keyPair.secretKey;
  } else {
    throw new Error('Invalid private key length');
  }

  const signature = nacl.sign.detached(messageBytes, secretKey);
  return Buffer.from(signature).toString('hex');
}

/**
 * Verify an Ed25519 signature
 */
export function verify(message: string, signature: string, publicKey: string): boolean {
  try {
    const messageBytes = new TextEncoder().encode(message);
    const signatureBytes = Buffer.from(signature, 'hex');
    const publicKeyBytes = Buffer.from(publicKey, 'hex');

    return nacl.sign.detached.verify(messageBytes, signatureBytes, publicKeyBytes);
  } catch {
    return false;
  }
}

// =============================================================================
// HASHING
// =============================================================================

/**
 * Compute SHA256 hash of a string
 */
export function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Generate runtime hashes from agent configuration
 */
export function generateRuntimeHashes(config: AgentConfig): RuntimeHashes {
  const configString =
    typeof config.fullConfig === 'string'
      ? config.fullConfig
      : JSON.stringify(config.fullConfig);

  return {
    configHash: sha256(configString),
    systemPromptHash: config.systemPrompt ? sha256(config.systemPrompt) : '',
    toolsHash: config.tools ? sha256(JSON.stringify(config.tools.sort())) : '',
    modelFingerprint: config.model
      ? sha256(`${config.model.name}:${config.model.version || ''}:${config.model.endpoint || ''}`)
      : '',
  };
}

// =============================================================================
// MESSAGE FORMATTING
// =============================================================================

/**
 * Create the message to sign for attestation
 */
export function createAttestationMessage(
  identityHash: string,
  runtime: {
    hashes: RuntimeHashes;
    timestamp: string;
    agentVersion?: string;
    platform?: string;
    uptimeSeconds?: number;
  },
  challenge: {
    challengeId: string;
    nonce: string;
  }
): string {
  return JSON.stringify({
    registeredIdentityHash: identityHash,
    runtime,
    challenge: {
      challengeId: challenge.challengeId,
      nonce: challenge.nonce,
    },
  });
}
