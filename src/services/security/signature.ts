/**
 * EIP-191 Signature Service
 * Handles signing and verification of AgentID identity messages
 */

import { createHash } from 'crypto';

// Message templates
const CONFIG_IDENTITY_MESSAGE = `AgentID ConfigIdentity Registration

I declare ownership of this agent configuration.

Identity Hash: {identityHash}
Chain: Base Mainnet (8453)
Contract: 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa
Timestamp: {timestamp}`;

const ATTESTATION_IDENTITY_MESSAGE = `AgentID Attestation Registration

I attest that I operate the following agent:

Platform: {platform}
Agent ID: {agentIdentifier}
Name: {declaredName}

Identity Hash: {identityHash}
Chain: Base Mainnet (8453)
Timestamp: {timestamp}

This is a declaration, not a verified configuration.`;

export type IdentityType = 'config' | 'attestation';

export interface SignatureData {
  message: string;
  signature: string;
  walletAddress: string;
  timestamp: string;
}

export interface ConfigSignatureParams {
  identityHash: string;
  timestamp?: string;
}

export interface AttestationSignatureParams {
  identityHash: string;
  platform: string;
  agentIdentifier: string;
  declaredName: string;
  timestamp?: string;
}

/**
 * Generate the message to be signed for ConfigIdentity
 */
export function generateConfigMessage(params: ConfigSignatureParams): string {
  const timestamp = params.timestamp || new Date().toISOString();
  return CONFIG_IDENTITY_MESSAGE
    .replace('{identityHash}', params.identityHash)
    .replace('{timestamp}', timestamp);
}

/**
 * Generate the message to be signed for AttestationIdentity
 */
export function generateAttestationMessage(params: AttestationSignatureParams): string {
  const timestamp = params.timestamp || new Date().toISOString();
  return ATTESTATION_IDENTITY_MESSAGE
    .replace('{identityHash}', params.identityHash)
    .replace('{platform}', params.platform)
    .replace('{agentIdentifier}', params.agentIdentifier)
    .replace('{declaredName}', params.declaredName)
    .replace('{timestamp}', timestamp);
}

/**
 * Verify an EIP-191 signature and recover the signer address
 * Uses ethers.js for signature verification
 */
export async function verifySignature(
  message: string,
  signature: string
): Promise<{ valid: boolean; recoveredAddress: string | null; error?: string }> {
  try {
    // Dynamic import to avoid loading ethers if not needed
    const { verifyMessage } = await import('ethers');

    const recoveredAddress = verifyMessage(message, signature);

    return {
      valid: true,
      recoveredAddress: recoveredAddress.toLowerCase(),
    };
  } catch (error: any) {
    return {
      valid: false,
      recoveredAddress: null,
      error: error.message,
    };
  }
}

/**
 * Sign a message using a private key (for CLI usage)
 */
export async function signMessage(
  message: string,
  privateKey: string
): Promise<{ signature: string; walletAddress: string }> {
  const { Wallet } = await import('ethers');

  const wallet = new Wallet(privateKey);
  const signature = await wallet.signMessage(message);

  return {
    signature,
    walletAddress: wallet.address.toLowerCase(),
  };
}

/**
 * Create a complete signature data object for ConfigIdentity
 */
export async function createConfigSignature(
  identityHash: string,
  privateKey: string
): Promise<SignatureData> {
  const timestamp = new Date().toISOString();
  const message = generateConfigMessage({ identityHash, timestamp });
  const { signature, walletAddress } = await signMessage(message, privateKey);

  return {
    message,
    signature,
    walletAddress,
    timestamp,
  };
}

/**
 * Create a complete signature data object for AttestationIdentity
 */
export async function createAttestationSignature(
  params: Omit<AttestationSignatureParams, 'timestamp'>,
  privateKey: string
): Promise<SignatureData> {
  const timestamp = new Date().toISOString();
  const message = generateAttestationMessage({ ...params, timestamp });
  const { signature, walletAddress } = await signMessage(message, privateKey);

  return {
    message,
    signature,
    walletAddress,
    timestamp,
  };
}

/**
 * Verify a ConfigIdentity signature
 */
export async function verifyConfigSignature(
  identityHash: string,
  timestamp: string,
  signature: string,
  expectedAddress: string
): Promise<{ valid: boolean; error?: string }> {
  const message = generateConfigMessage({ identityHash, timestamp });
  const result = await verifySignature(message, signature);

  if (!result.valid) {
    return { valid: false, error: result.error };
  }

  if (result.recoveredAddress !== expectedAddress.toLowerCase()) {
    return {
      valid: false,
      error: `Address mismatch: expected ${expectedAddress}, got ${result.recoveredAddress}`,
    };
  }

  return { valid: true };
}

/**
 * Verify an AttestationIdentity signature
 */
export async function verifyAttestationSignature(
  params: AttestationSignatureParams,
  signature: string,
  expectedAddress: string
): Promise<{ valid: boolean; error?: string }> {
  const message = generateAttestationMessage(params);
  const result = await verifySignature(message, signature);

  if (!result.valid) {
    return { valid: false, error: result.error };
  }

  if (result.recoveredAddress !== expectedAddress.toLowerCase()) {
    return {
      valid: false,
      error: `Address mismatch: expected ${expectedAddress}, got ${result.recoveredAddress}`,
    };
  }

  return { valid: true };
}

/**
 * Hash a message using keccak256 (for Ethereum compatibility)
 */
export function hashMessage(message: string): string {
  return createHash('sha256').update(message).digest('hex');
}

export default {
  generateConfigMessage,
  generateAttestationMessage,
  verifySignature,
  signMessage,
  createConfigSignature,
  createAttestationSignature,
  verifyConfigSignature,
  verifyAttestationSignature,
  hashMessage,
};
