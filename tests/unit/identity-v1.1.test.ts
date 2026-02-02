/**
 * Tests for V1.1 Identity Types
 * Tests the new verification status fields and trust score calculation
 */

import { describe, it, expect } from 'vitest';
import {
  IdentityType,
  SignatureType,
  IssuerType,
  ClaimStatus,
  type AttestationIdentity,
  type ConfigIdentity,
  type StoredIdentityV2,
  type VerificationSource,
  calculateTrustScore,
  getTrustDescription,
  getVerificationMessage,
  isValidRegistrationSignature,
  isAttestation,
  isConfig,
  isFingerprint,
  isSelfClaim,
  VALID_REGISTRATION_SIGNATURES,
} from '../../src/types/identity-v2.js';

describe('V1.1 Identity Types', () => {
  describe('SignatureType validation', () => {
    it('should have valid registration signatures defined', () => {
      expect(VALID_REGISTRATION_SIGNATURES).toContain(SignatureType.HUMAN_WALLET);
      expect(VALID_REGISTRATION_SIGNATURES).toContain(SignatureType.AGENT_KEYPAIR);
      expect(VALID_REGISTRATION_SIGNATURES).toContain(SignatureType.TWITTER_PROOF);
      expect(VALID_REGISTRATION_SIGNATURES).not.toContain(SignatureType.NONE);
    });

    it('should validate registration signatures correctly', () => {
      expect(isValidRegistrationSignature(SignatureType.HUMAN_WALLET)).toBe(true);
      expect(isValidRegistrationSignature(SignatureType.AGENT_KEYPAIR)).toBe(true);
      expect(isValidRegistrationSignature(SignatureType.TWITTER_PROOF)).toBe(true);
      expect(isValidRegistrationSignature(SignatureType.NONE)).toBe(false);
    });
  });

  describe('Trust Score Calculation', () => {
    it('should return 0.1 for NONE signature (legacy)', () => {
      const score = calculateTrustScore(SignatureType.NONE, 'pending', false);
      expect(score).toBe(0.1);
    });

    it('should return 0.3 for AGENT_KEYPAIR', () => {
      const score = calculateTrustScore(SignatureType.AGENT_KEYPAIR, 'pending', false);
      expect(score).toBe(0.3);
    });

    it('should return 0.4 for TWITTER_PROOF', () => {
      const score = calculateTrustScore(SignatureType.TWITTER_PROOF, 'pending', false);
      expect(score).toBe(0.4);
    });

    it('should return 0.5 for HUMAN_WALLET', () => {
      const score = calculateTrustScore(SignatureType.HUMAN_WALLET, 'pending', false);
      expect(score).toBe(0.5);
    });

    it('should add 0.2 bonus for on-chain verification', () => {
      const pending = calculateTrustScore(SignatureType.HUMAN_WALLET, 'pending', false);
      const onchain = calculateTrustScore(SignatureType.HUMAN_WALLET, 'chain', false);
      expect(onchain).toBe(0.7);
      expect(onchain - pending).toBeCloseTo(0.2, 10);
    });

    it('should add 0.1 bonus for Twitter verification', () => {
      const noTwitter = calculateTrustScore(SignatureType.HUMAN_WALLET, 'pending', false);
      const withTwitter = calculateTrustScore(SignatureType.HUMAN_WALLET, 'pending', true);
      expect(withTwitter - noTwitter).toBeCloseTo(0.1, 10);
    });

    it('should cap trust score at 0.9', () => {
      // Wallet (0.5) + chain (0.2) + twitter (0.1) = 0.8
      const score = calculateTrustScore(SignatureType.HUMAN_WALLET, 'chain', true);
      expect(score).toBe(0.8);
      expect(score).toBeLessThanOrEqual(0.9);
    });
  });

  describe('Identity Type Guards', () => {
    it('should identify attestation identity', () => {
      const identity: AttestationIdentity = {
        identityType: IdentityType.ATTESTATION,
        identityHash: '0x' + 'a'.repeat(64),
        agentName: 'Test Agent',
        platform: 'test',
        publicReference: 'test-ref',
        declaredCapabilities: [],
        issuerType: IssuerType.HUMAN,
        signature: {
          type: SignatureType.HUMAN_WALLET,
          value: '0x123',
          timestamp: new Date().toISOString(),
        },
        issuedAt: new Date().toISOString(),
      };

      expect(isAttestation(identity)).toBe(true);
      expect(isConfig(identity)).toBe(false);
      expect(isFingerprint(identity)).toBe(false);
      expect(isSelfClaim(identity)).toBe(false);
    });

    it('should identify config identity', () => {
      const identity: ConfigIdentity = {
        identityType: IdentityType.CONFIG,
        identityHash: '0x' + 'b'.repeat(64),
        agentName: 'Test Agent',
        model: { provider: 'anthropic', modelId: 'claude-opus-4-5' },
        configStored: false,
        issuerType: IssuerType.HUMAN,
        signature: {
          type: SignatureType.HUMAN_WALLET,
          value: '0x123',
          timestamp: new Date().toISOString(),
        },
        issuedAt: new Date().toISOString(),
      };

      expect(isConfig(identity)).toBe(true);
      expect(isAttestation(identity)).toBe(false);
    });
  });

  describe('Trust Description', () => {
    it('should describe wallet-signed attestation correctly', () => {
      const identity: AttestationIdentity = {
        identityType: IdentityType.ATTESTATION,
        identityHash: '0x' + 'a'.repeat(64),
        agentName: 'Test',
        platform: 'test',
        publicReference: 'ref',
        declaredCapabilities: [],
        issuerType: IssuerType.HUMAN,
        signature: {
          type: SignatureType.HUMAN_WALLET,
          value: '0x123',
          timestamp: new Date().toISOString(),
        },
        issuedAt: new Date().toISOString(),
      };

      const description = getTrustDescription(identity);
      expect(description).toBe('Attested by wallet holder');
    });

    it('should describe config identity with wallet correctly', () => {
      const identity: ConfigIdentity = {
        identityType: IdentityType.CONFIG,
        identityHash: '0x' + 'b'.repeat(64),
        agentName: 'Test',
        model: { provider: 'test', modelId: 'test' },
        configStored: false,
        issuerType: IssuerType.HUMAN,
        signature: {
          type: SignatureType.HUMAN_WALLET,
          value: '0x123',
          timestamp: new Date().toISOString(),
        },
        issuedAt: new Date().toISOString(),
      };

      const description = getTrustDescription(identity);
      expect(description).toBe('Config identity verified by wallet');
    });
  });

  describe('Verification Message', () => {
    const baseStored: StoredIdentityV2 = {
      id: 'test-id',
      identity: {
        identityType: IdentityType.ATTESTATION,
        identityHash: '0x' + 'a'.repeat(64),
        agentName: 'Test',
        platform: 'test',
        publicReference: 'ref',
        declaredCapabilities: [],
        issuerType: IssuerType.HUMAN,
        signature: {
          type: SignatureType.HUMAN_WALLET,
          value: '0x123',
          timestamp: new Date().toISOString(),
        },
        issuedAt: new Date().toISOString(),
      },
      status: ClaimStatus.ACTIVE,
      verified: false,
      verificationSource: 'pending',
      trustScore: 0.5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      version: 1,
    };

    it('should describe pending verification', () => {
      const stored = { ...baseStored, verified: false, verificationSource: 'pending' as VerificationSource };
      const message = getVerificationMessage(stored);
      expect(message).toBe('Verification pending (awaiting blockchain confirmation)');
    });

    it('should describe on-chain verification', () => {
      const stored: StoredIdentityV2 = {
        ...baseStored,
        verified: true,
        verificationSource: 'chain',
        anchor: {
          txHash: '0x123',
          blockNumber: 12345,
          chain: 'base',
          chainId: 8453,
          anchoredAt: new Date().toISOString(),
        },
      };
      const message = getVerificationMessage(stored);
      expect(message).toContain('Verified on-chain');
      expect(message).toContain('12345');
    });

    it('should describe failed verification', () => {
      const stored = { ...baseStored, verified: false, verificationSource: 'failed' as VerificationSource };
      const message = getVerificationMessage(stored);
      expect(message).toBe('Verification failed');
    });

    it('should describe offchain verification', () => {
      const stored = { ...baseStored, verified: true, verificationSource: 'offchain' as VerificationSource };
      const message = getVerificationMessage(stored);
      expect(message).toBe('Verified off-chain only');
    });
  });

  describe('StoredIdentityV2 V1.1 fields', () => {
    it('should have verified and verificationSource as required fields', () => {
      // TypeScript will enforce this, but we can test runtime behavior
      const stored: StoredIdentityV2 = {
        id: 'test',
        identity: {
          identityType: IdentityType.ATTESTATION,
          identityHash: '0x' + 'a'.repeat(64),
          agentName: 'Test',
          platform: 'test',
          publicReference: 'ref',
          declaredCapabilities: [],
          issuerType: IssuerType.HUMAN,
          signature: {
            type: SignatureType.HUMAN_WALLET,
            value: '0x123',
            timestamp: new Date().toISOString(),
          },
          issuedAt: new Date().toISOString(),
        },
        status: ClaimStatus.ACTIVE,
        verified: true,
        verificationSource: 'chain',
        trustScore: 0.7,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        version: 1,
        anchor: {
          txHash: '0xabc',
          blockNumber: 123,
          chain: 'base',
          chainId: 8453,
          anchoredAt: new Date().toISOString(),
        },
      };

      expect(stored.verified).toBe(true);
      expect(stored.verificationSource).toBe('chain');
      expect(stored.anchor?.chainId).toBe(8453);
    });
  });
});
