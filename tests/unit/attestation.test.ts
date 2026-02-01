/**
 * Tests for Attestation Service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  AttestationService,
  getAttestationService,
  resetAttestationService,
  hexToBytes,
  bytesToHex,
} from '../../src/services/attestation/attestation.js';
import { AttestationType, TrustLevel } from '../../src/types/identity.js';

describe('AttestationService', () => {
  let service: AttestationService;

  beforeEach(() => {
    resetAttestationService();
    service = new AttestationService();
  });

  describe('Key Generation', () => {
    it('should generate valid key pairs', () => {
      const keyPair = AttestationService.generateKeyPair();

      expect(keyPair.privateKey).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey.length).toBe(64); // 32 bytes in hex
      expect(keyPair.publicKey.length).toBe(64);
    });

    it('should generate different keys each time', () => {
      const keyPair1 = AttestationService.generateKeyPair();
      const keyPair2 = AttestationService.generateKeyPair();

      expect(keyPair1.privateKey).not.toBe(keyPair2.privateKey);
      expect(keyPair1.publicKey).not.toBe(keyPair2.publicKey);
    });

    it('should return public key', () => {
      const publicKey = service.getPublicKey();

      expect(publicKey).toBeDefined();
      expect(publicKey.length).toBe(64);
    });
  });

  describe('Attestation Creation', () => {
    it('should create a valid attestation', async () => {
      const attestation = await service.createAttestation({
        identityHash: 'abc123def456'.repeat(5) + 'abcd',
        type: AttestationType.IDENTITY_VALIDATION,
        trustLevel: TrustLevel.HIGH,
        claim: 'Agent identity verified',
      });

      expect(attestation.id).toBeDefined();
      expect(attestation.agentIdentityHash).toBe('abc123def456'.repeat(5) + 'abcd');
      expect(attestation.type).toBe(AttestationType.IDENTITY_VALIDATION);
      expect(attestation.trustLevel).toBe(TrustLevel.HIGH);
      expect(attestation.signature).toBeDefined();
      expect(attestation.issuer.name).toBe('agent007');
      expect(attestation.validity.issuedAt).toBeDefined();
      expect(attestation.validity.validUntil).toBeDefined();
    });

    it('should include custom data in attestation', async () => {
      const attestation = await service.createAttestation({
        identityHash: 'abc123def456'.repeat(5) + 'abcd',
        type: AttestationType.BEHAVIORAL,
        trustLevel: TrustLevel.MEDIUM,
        claim: 'Behavioral analysis completed',
        data: {
          autonomyScore: 0.92,
          samplesAnalyzed: 100,
        },
      });

      expect(attestation.payload.data).toEqual({
        autonomyScore: 0.92,
        samplesAnalyzed: 100,
      });
    });

    it('should set validity period correctly', async () => {
      const attestation = await service.createAttestation({
        identityHash: 'abc123def456'.repeat(5) + 'abcd',
        type: AttestationType.IDENTITY_VALIDATION,
        trustLevel: TrustLevel.HIGH,
        claim: 'Test',
        validitySeconds: 3600, // 1 hour
      });

      const issuedAt = new Date(attestation.validity.issuedAt);
      const validUntil = new Date(attestation.validity.validUntil);
      const diffMs = validUntil.getTime() - issuedAt.getTime();

      expect(diffMs).toBeCloseTo(3600 * 1000, -3); // Within 1 second
    });
  });

  describe('Attestation Verification', () => {
    it('should verify a valid attestation', async () => {
      const attestation = await service.createAttestation({
        identityHash: 'abc123def456'.repeat(5) + 'abcd',
        type: AttestationType.IDENTITY_VALIDATION,
        trustLevel: TrustLevel.HIGH,
        claim: 'Test claim',
      });

      const result = await service.verifyAttestation(attestation);

      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
      expect(result.signerPublicKey).toBe(service.getPublicKey());
    });

    it('should reject expired attestation', async () => {
      const attestation = await service.createAttestation({
        identityHash: 'abc123def456'.repeat(5) + 'abcd',
        type: AttestationType.IDENTITY_VALIDATION,
        trustLevel: TrustLevel.HIGH,
        claim: 'Test',
        validitySeconds: -1, // Already expired
      });

      const result = await service.verifyAttestation(attestation);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Attestation has expired');
    });

    it('should reject revoked attestation', async () => {
      const attestation = await service.createAttestation({
        identityHash: 'abc123def456'.repeat(5) + 'abcd',
        type: AttestationType.IDENTITY_VALIDATION,
        trustLevel: TrustLevel.HIGH,
        claim: 'Test',
      });

      // Manually revoke
      attestation.revokedAt = new Date().toISOString();

      const result = await service.verifyAttestation(attestation);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Attestation has been revoked');
    });

    it('should reject attestation with tampered payload', async () => {
      const attestation = await service.createAttestation({
        identityHash: 'abc123def456'.repeat(5) + 'abcd',
        type: AttestationType.IDENTITY_VALIDATION,
        trustLevel: TrustLevel.HIGH,
        claim: 'Original claim',
      });

      // Tamper with payload
      attestation.payload.claim = 'Tampered claim';

      const result = await service.verifyAttestation(attestation);

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid signature');
    });
  });

  describe('Certificate Creation', () => {
    it('should create a valid certificate', async () => {
      const certificate = await service.createCertificate(
        'abc123def456'.repeat(5) + 'abcd',
        'Test Agent',
        {
          configurationVerified: true,
          behavioralBaselineEstablished: true,
          autonomyScore: 0.95,
          trustLevel: TrustLevel.HIGH,
        }
      );

      expect(certificate.version).toBe('1.0');
      expect(certificate.type).toBe('agent_identity');
      expect(certificate.subject.identityHash).toBe('abc123def456'.repeat(5) + 'abcd');
      expect(certificate.subject.displayName).toBe('Test Agent');
      expect(certificate.claims.configurationVerified).toBe(true);
      expect(certificate.claims.autonomyScore).toBe(0.95);
      expect(certificate.signature).toBeDefined();
    });

    it('should verify a valid certificate', async () => {
      const certificate = await service.createCertificate(
        'abc123def456'.repeat(5) + 'abcd',
        'Test Agent',
        {
          configurationVerified: true,
          behavioralBaselineEstablished: true,
          trustLevel: TrustLevel.HIGH,
        }
      );

      const result = await service.verifyCertificate(certificate);

      expect(result.valid).toBe(true);
    });

    it('should reject certificate with tampered claims', async () => {
      const certificate = await service.createCertificate(
        'abc123def456'.repeat(5) + 'abcd',
        'Test Agent',
        {
          configurationVerified: true,
          behavioralBaselineEstablished: true,
          trustLevel: TrustLevel.HIGH,
        }
      );

      // Tamper with claims
      certificate.claims.autonomyScore = 0.99;

      const result = await service.verifyCertificate(certificate);

      expect(result.valid).toBe(false);
    });
  });

  describe('Signature Operations', () => {
    it('should sign and verify data', async () => {
      const data = 'Hello, world!';
      const signature = await service.signData(data);

      const isValid = await service.verifySignature(
        data,
        signature,
        service.getPublicKey()
      );

      expect(isValid).toBe(true);
    });

    it('should reject invalid signature', async () => {
      const data = 'Hello, world!';
      const signature = await service.signData(data);

      const isValid = await service.verifySignature(
        'Different data',
        signature,
        service.getPublicKey()
      );

      expect(isValid).toBe(false);
    });
  });

  describe('Utility Functions', () => {
    it('should convert hex to bytes and back', () => {
      const originalHex = 'deadbeef0123456789abcdef';
      const bytes = hexToBytes(originalHex);
      const convertedHex = bytesToHex(bytes);

      expect(convertedHex).toBe(originalHex);
    });

    it('should hash data consistently', () => {
      const data = 'test data';
      const hash1 = service.hashData(data);
      const hash2 = service.hashData(data);

      expect(hash1).toBe(hash2);
      expect(hash1.length).toBe(64); // SHA-256 produces 64 hex chars
    });
  });
});
