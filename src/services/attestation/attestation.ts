/**
 * Agent007 - Attestation Service
 *
 * Implements Ed25519 digital signatures for agent identity attestation.
 * Attestations prove that an agent's identity has been verified.
 */

import * as ed from '@noble/ed25519';
import { sha512 } from '@noble/hashes/sha2.js';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import type {
  Attestation,
  AttestationType,
  TrustLevel,
  AttestationPayload,
} from '../../types/identity.js';

// Configure ed25519 to use sha512
ed.etc.sha512Sync = (...m) => sha512(ed.etc.concatBytes(...m));

// =============================================================================
// TYPES
// =============================================================================

export interface KeyPair {
  /** Private key (32 bytes, hex encoded) */
  privateKey: string;

  /** Public key (32 bytes, hex encoded) */
  publicKey: string;
}

export interface AttestationRequest {
  /** Identity hash to attest */
  identityHash: string;

  /** Type of attestation */
  type: AttestationType;

  /** Trust level */
  trustLevel: TrustLevel;

  /** Claim being made */
  claim: string;

  /** Additional data */
  data?: Record<string, unknown>;

  /** Validity duration in seconds */
  validitySeconds?: number;
}

export interface AttestationCertificate {
  /** Certificate version */
  version: '1.0';

  /** Certificate type */
  type: 'agent_identity';

  /** Subject information */
  subject: {
    identityHash: string;
    displayName?: string;
  };

  /** Issuer information */
  issuer: {
    name: string;
    publicKey: string;
  };

  /** Validity period */
  validity: {
    notBefore: string;
    notAfter: string;
  };

  /** Claims made in this certificate */
  claims: {
    configurationVerified: boolean;
    behavioralBaselineEstablished: boolean;
    autonomyScore?: number;
    trustLevel: TrustLevel;
  };

  /** Signature over the certificate */
  signature: string;

  /** Certificate serial number */
  serialNumber: string;
}

export interface SignatureVerificationResult {
  /** Whether signature is valid */
  valid: boolean;

  /** Error message if invalid */
  error?: string;

  /** Signer's public key */
  signerPublicKey?: string;

  /** When verification was performed */
  verifiedAt: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const ISSUER_NAME = 'agent007';
const DEFAULT_VALIDITY_SECONDS = 365 * 24 * 60 * 60; // 1 year

// =============================================================================
// ATTESTATION SERVICE CLASS
// =============================================================================

export class AttestationService {
  private privateKey: Uint8Array;
  private publicKey: Uint8Array;
  private publicKeyHex: string;

  constructor(privateKeyHex?: string) {
    if (privateKeyHex) {
      this.privateKey = hexToBytes(privateKeyHex);
      this.publicKey = ed.getPublicKey(this.privateKey);
    } else {
      // Generate new key pair
      this.privateKey = ed.utils.randomPrivateKey();
      this.publicKey = ed.getPublicKey(this.privateKey);
    }

    this.publicKeyHex = bytesToHex(this.publicKey);
  }

  /**
   * Generates a new Ed25519 key pair
   */
  static generateKeyPair(): KeyPair {
    const privateKey = ed.utils.randomPrivateKey();
    const publicKey = ed.getPublicKey(privateKey);

    return {
      privateKey: bytesToHex(privateKey),
      publicKey: bytesToHex(publicKey),
    };
  }

  /**
   * Gets the service's public key
   */
  getPublicKey(): string {
    return this.publicKeyHex;
  }

  /**
   * Creates an attestation for an agent identity
   */
  async createAttestation(request: AttestationRequest): Promise<Attestation> {
    const attestationId = uuidv4();
    const nonce = randomBytes(16).toString('hex');
    const timestamp = new Date().toISOString();

    const validitySeconds = request.validitySeconds || DEFAULT_VALIDITY_SECONDS;
    const validUntil = new Date(Date.now() + validitySeconds * 1000).toISOString();

    // Create payload
    const payload: AttestationPayload = {
      identityHash: request.identityHash,
      claim: request.claim,
      data: request.data,
      nonce,
      timestamp,
    };

    // Sign the payload
    const signature = await this.signPayload(payload);

    return {
      id: attestationId,
      agentIdentityHash: request.identityHash,
      type: request.type,
      trustLevel: request.trustLevel,
      payload,
      signature,
      issuer: {
        name: ISSUER_NAME,
        publicKey: this.publicKeyHex,
      },
      validity: {
        issuedAt: timestamp,
        validUntil,
      },
    };
  }

  /**
   * Creates an identity certificate for a validated agent
   */
  async createCertificate(
    identityHash: string,
    displayName: string,
    claims: {
      configurationVerified: boolean;
      behavioralBaselineEstablished: boolean;
      autonomyScore?: number;
      trustLevel: TrustLevel;
    },
    validitySeconds: number = DEFAULT_VALIDITY_SECONDS
  ): Promise<AttestationCertificate> {
    const now = new Date();
    const notAfter = new Date(now.getTime() + validitySeconds * 1000);
    const serialNumber = randomBytes(16).toString('hex');

    // Create certificate without signature
    const certWithoutSig = {
      version: '1.0' as const,
      type: 'agent_identity' as const,
      subject: {
        identityHash,
        displayName,
      },
      issuer: {
        name: ISSUER_NAME,
        publicKey: this.publicKeyHex,
      },
      validity: {
        notBefore: now.toISOString(),
        notAfter: notAfter.toISOString(),
      },
      claims,
      serialNumber,
    };

    // Sign the certificate
    const signature = await this.signData(JSON.stringify(certWithoutSig));

    return {
      ...certWithoutSig,
      signature,
    };
  }

  /**
   * Verifies an attestation signature
   */
  async verifyAttestation(attestation: Attestation): Promise<SignatureVerificationResult> {
    try {
      // Check if attestation has expired
      if (new Date(attestation.validity.validUntil) < new Date()) {
        return {
          valid: false,
          error: 'Attestation has expired',
          verifiedAt: new Date().toISOString(),
        };
      }

      // Check if attestation was revoked
      if (attestation.revokedAt) {
        return {
          valid: false,
          error: 'Attestation has been revoked',
          verifiedAt: new Date().toISOString(),
        };
      }

      // Verify signature
      const payloadBytes = new TextEncoder().encode(JSON.stringify(attestation.payload));
      const signatureBytes = hexToBytes(attestation.signature);
      const publicKeyBytes = hexToBytes(attestation.issuer.publicKey);

      const isValid = ed.verify(signatureBytes, payloadBytes, publicKeyBytes);

      return {
        valid: isValid,
        error: isValid ? undefined : 'Invalid signature',
        signerPublicKey: attestation.issuer.publicKey,
        verifiedAt: new Date().toISOString(),
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Verification failed',
        verifiedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Verifies a certificate signature
   */
  async verifyCertificate(certificate: AttestationCertificate): Promise<SignatureVerificationResult> {
    try {
      // Check validity period
      const now = new Date();
      if (now < new Date(certificate.validity.notBefore)) {
        return {
          valid: false,
          error: 'Certificate not yet valid',
          verifiedAt: now.toISOString(),
        };
      }

      if (now > new Date(certificate.validity.notAfter)) {
        return {
          valid: false,
          error: 'Certificate has expired',
          verifiedAt: now.toISOString(),
        };
      }

      // Create certificate without signature for verification
      const { signature, ...certWithoutSig } = certificate;

      // Verify signature
      const certBytes = new TextEncoder().encode(JSON.stringify(certWithoutSig));
      const signatureBytes = hexToBytes(signature);
      const publicKeyBytes = hexToBytes(certificate.issuer.publicKey);

      const isValid = ed.verify(signatureBytes, certBytes, publicKeyBytes);

      return {
        valid: isValid,
        error: isValid ? undefined : 'Invalid certificate signature',
        signerPublicKey: certificate.issuer.publicKey,
        verifiedAt: now.toISOString(),
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Certificate verification failed',
        verifiedAt: new Date().toISOString(),
      };
    }
  }

  /**
   * Signs arbitrary data
   */
  async signData(data: string): Promise<string> {
    const dataBytes = new TextEncoder().encode(data);
    const signature = ed.sign(dataBytes, this.privateKey);
    return bytesToHex(signature);
  }

  /**
   * Verifies a signature on arbitrary data
   */
  async verifySignature(
    data: string,
    signature: string,
    publicKey: string
  ): Promise<boolean> {
    try {
      const dataBytes = new TextEncoder().encode(data);
      const signatureBytes = hexToBytes(signature);
      const publicKeyBytes = hexToBytes(publicKey);

      return ed.verify(signatureBytes, dataBytes, publicKeyBytes);
    } catch {
      return false;
    }
  }

  /**
   * Signs an attestation payload
   */
  private async signPayload(payload: AttestationPayload): Promise<string> {
    const payloadString = JSON.stringify(payload);
    return this.signData(payloadString);
  }

  /**
   * Hashes data using SHA-256
   */
  hashData(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Creates a chain of attestations (for future multi-party attestation)
   */
  async createAttestationChain(
    attestations: Attestation[]
  ): Promise<{
    chainId: string;
    attestations: Attestation[];
    chainSignature: string;
  }> {
    const chainId = uuidv4();

    // Create a hash of all attestation IDs in order
    const chainData = attestations.map((a) => a.id).join(':');
    const chainSignature = await this.signData(chainData);

    return {
      chainId,
      attestations,
      chainSignature,
    };
  }
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let attestationServiceInstance: AttestationService | null = null;

export function getAttestationService(): AttestationService {
  if (!attestationServiceInstance) {
    // In production, load private key from secure storage (HSM, Vault, etc.)
    const privateKey = process.env.ATTESTATION_PRIVATE_KEY;
    attestationServiceInstance = new AttestationService(privateKey);
  }
  return attestationServiceInstance;
}

export function resetAttestationService(): void {
  attestationServiceInstance = null;
}

// Export utility functions
export { hexToBytes, bytesToHex };
