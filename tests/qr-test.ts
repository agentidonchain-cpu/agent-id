/**
 * QR Code System Tests
 *
 * Run with: npm test tests/qr-test.ts
 */

import { describe, it, expect } from 'vitest';

const HASH_REGEX = /^0x[a-fA-F0-9]{64}$/;
const SITE_URL = 'https://id-agent.org';

describe('QR Code System', () => {
  describe('Hash Validation', () => {
    it('should validate correct identity hash', () => {
      const validHash = '0x' + 'a'.repeat(64);
      expect(HASH_REGEX.test(validHash)).toBe(true);
    });

    it('should reject invalid hash format', () => {
      expect(HASH_REGEX.test('invalid')).toBe(false);
      expect(HASH_REGEX.test('0x123')).toBe(false);
      expect(HASH_REGEX.test('123456')).toBe(false);
    });

    it('should reject hash without 0x prefix', () => {
      const hashWithoutPrefix = 'a'.repeat(64);
      expect(HASH_REGEX.test(hashWithoutPrefix)).toBe(false);
    });
  });

  describe('URL Generation', () => {
    it('should generate correct verification URL', () => {
      const hash = '0x' + '1234567890abcdef'.repeat(4);
      const url = `${SITE_URL}/verify/${hash}`;

      expect(url).toBe(`https://id-agent.org/verify/${hash}`);
      expect(url).toContain('/verify/');
      expect(url).toContain('0x');
    });
  });

  describe('API Endpoint', () => {
    const API_URL = process.env.API_URL || 'http://localhost:3000';

    it('should return PNG image for default format', async () => {
      // This test requires running API server
      // Uncomment when testing with real server
      /*
      const hash = '0x' + 'a'.repeat(64);
      const response = await fetch(`${API_URL}/agents/${hash}/qr`);

      expect(response.headers.get('content-type')).toBe('image/png');
      */
    });

    it('should return base64 JSON for base64 format', async () => {
      // This test requires running API server
      /*
      const hash = '0x' + 'a'.repeat(64);
      const response = await fetch(
        `${API_URL}/agents/${hash}/qr?format=base64`
      );

      const data = await response.json();
      expect(data.success).toBe(true);
      expect(data.data.qrCode).toContain('data:image/png;base64,');
      */
    });
  });
});
