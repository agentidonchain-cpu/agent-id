/**
 * AttestationIdentity Types
 * For closed platforms (ChatGPT Store, SaaS) where user cannot access config
 */

/**
 * AttestationIdentity represents a declaration of ownership for an agent
 * on a closed platform where configuration cannot be verified.
 */
export interface AttestationIdentity {
  type: 'attestation';
  version: '1.0';

  // Declaration components
  platform: string;              // e.g., 'chatgpt', 'character.ai', 'poe'
  agentIdentifier: string;       // Platform-specific ID or URL
  declaredName: string;          // What user claims agent is called
  declaredCapabilities: string[]; // What user claims agent does

  // Signature components
  owner: string;                 // Wallet address
  signature: string;             // EIP-191 signature
  signedAt: string;              // ISO8601 timestamp
}

/**
 * Known platforms for attestation
 */
export enum AttestationPlatform {
  CHATGPT = 'chatgpt',
  CHARACTER_AI = 'character.ai',
  POE = 'poe',
  CLAUDE = 'claude.ai',
  CUSTOM_GPT = 'custom-gpt',
  HUGGINGFACE = 'huggingface',
  REPLICATE = 'replicate',
  OTHER = 'other',
}

/**
 * Parameters for creating an attestation hash
 */
export interface AttestationHashParams {
  platform: string;
  agentIdentifier: string;
  owner: string;
  signedAt: string;
}

/**
 * Attestation registration request
 */
export interface AttestationRegistrationRequest {
  platform: string;
  agentIdentifier: string;
  declaredName: string;
  declaredCapabilities?: string[];
  identityHash: string;
  signature: string;
  walletAddress: string;
  timestamp: string;
}

/**
 * Compute attestation identity hash
 * Hash = SHA256("attestation:1.0" + platform + agentIdentifier + owner + signedAt)
 */
export function computeAttestationHash(params: AttestationHashParams): string {
  const crypto = require('crypto');
  const input = `attestation:1.0|${params.platform}|${params.agentIdentifier}|${params.owner}|${params.signedAt}`;
  return '0x' + crypto.createHash('sha256').update(input).digest('hex');
}

/**
 * Validate attestation parameters
 */
export function validateAttestationParams(params: Partial<AttestationHashParams>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!params.platform || params.platform.length === 0) {
    errors.push('Platform is required');
  }

  if (!params.agentIdentifier || params.agentIdentifier.length === 0) {
    errors.push('Agent identifier is required');
  }

  if (!params.owner || !/^0x[a-fA-F0-9]{40}$/.test(params.owner)) {
    errors.push('Valid wallet address is required');
  }

  if (!params.signedAt || isNaN(Date.parse(params.signedAt))) {
    errors.push('Valid timestamp is required');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export default {
  computeAttestationHash,
  validateAttestationParams,
  AttestationPlatform,
};
