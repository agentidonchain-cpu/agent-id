/**
 * Agent007 - Encryption Service
 *
 * Provides AES-256-GCM encryption for sensitive data like system prompts.
 * Uses scrypt for key derivation and includes replay protection.
 */

import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scrypt,
  createHash,
  timingSafeEqual,
} from 'crypto';

// =============================================================================
// CONSTANTS
// =============================================================================

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 16; // 128 bits (AES block size)
const SALT_LENGTH = 32; // 256 bits
const AUTH_TAG_LENGTH = 16; // 128 bits

// Wrapper for scrypt with Promise
function scryptAsync(password: Buffer, salt: Buffer, keylen: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

// =============================================================================
// TYPES
// =============================================================================

export interface EncryptedData {
  /** Base64-encoded encrypted data (salt + iv + authTag + ciphertext) */
  data: string;

  /** Key identifier for key rotation support */
  keyId: string;

  /** Algorithm used */
  algorithm: string;

  /** Version of the encryption format */
  version: string;
}

export interface DecryptedData {
  /** Decrypted plaintext */
  plaintext: string;

  /** Whether decryption was successful */
  success: boolean;

  /** Error message if decryption failed */
  error?: string;
}

export interface KeyInfo {
  /** Key identifier */
  keyId: string;

  /** When the key was created */
  createdAt: Date;

  /** When the key expires */
  expiresAt?: Date;

  /** Whether this is the active key for encryption */
  isActive: boolean;
}

// =============================================================================
// ENCRYPTION SERVICE CLASS
// =============================================================================

export class EncryptionService {
  private masterKey: Buffer;
  private keyId: string;

  constructor(masterKeyHex: string) {
    if (masterKeyHex.length !== 64) {
      throw new Error('Master key must be 32 bytes (64 hex characters)');
    }

    this.masterKey = Buffer.from(masterKeyHex, 'hex');
    this.keyId = this.generateKeyId(this.masterKey);
  }

  /**
   * Encrypts a plaintext string using AES-256-GCM
   */
  async encrypt(plaintext: string): Promise<EncryptedData> {
    // Generate random salt and IV
    const salt = randomBytes(SALT_LENGTH);
    const iv = randomBytes(IV_LENGTH);

    // Derive encryption key from master key using scrypt
    const derivedKey = await scryptAsync(this.masterKey, salt, KEY_LENGTH);

    // Create cipher and encrypt
    const cipher = createCipheriv(ALGORITHM, derivedKey, iv);

    const encrypted = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);

    const authTag = cipher.getAuthTag();

    // Combine: salt (32) + iv (16) + authTag (16) + ciphertext
    const combined = Buffer.concat([salt, iv, authTag, encrypted]);

    return {
      data: combined.toString('base64'),
      keyId: this.keyId,
      algorithm: ALGORITHM,
      version: '1.0',
    };
  }

  /**
   * Decrypts encrypted data
   */
  async decrypt(encryptedData: EncryptedData): Promise<DecryptedData> {
    try {
      // Verify key ID matches (for key rotation support)
      if (encryptedData.keyId !== this.keyId) {
        return {
          plaintext: '',
          success: false,
          error: 'Key ID mismatch - data encrypted with different key',
        };
      }

      // Verify algorithm
      if (encryptedData.algorithm !== ALGORITHM) {
        return {
          plaintext: '',
          success: false,
          error: `Unsupported algorithm: ${encryptedData.algorithm}`,
        };
      }

      // Decode combined data
      const combined = Buffer.from(encryptedData.data, 'base64');

      // Extract components
      const salt = combined.subarray(0, SALT_LENGTH);
      const iv = combined.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);
      const authTag = combined.subarray(
        SALT_LENGTH + IV_LENGTH,
        SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
      );
      const ciphertext = combined.subarray(
        SALT_LENGTH + IV_LENGTH + AUTH_TAG_LENGTH
      );

      // Derive key
      const derivedKey = await scryptAsync(this.masterKey, salt, KEY_LENGTH);

      // Create decipher
      const decipher = createDecipheriv(ALGORITHM, derivedKey, iv);
      decipher.setAuthTag(authTag);

      // Decrypt
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final(),
      ]);

      return {
        plaintext: decrypted.toString('utf8'),
        success: true,
      };
    } catch (error) {
      return {
        plaintext: '',
        success: false,
        error: error instanceof Error ? error.message : 'Decryption failed',
      };
    }
  }

  /**
   * Encrypts data for a specific recipient using their public key
   * (For future use with asymmetric encryption)
   */
  async encryptForRecipient(
    plaintext: string,
    _recipientPublicKey: string
  ): Promise<EncryptedData> {
    // For MVP, use symmetric encryption
    // In production, implement hybrid encryption (RSA-OAEP + AES-GCM)
    return this.encrypt(plaintext);
  }

  /**
   * Generates a secure random token
   */
  generateToken(length: number = 32): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Generates a secure API key with prefix
   */
  generateApiKey(prefix: string = 'agent007_'): { key: string; hash: string } {
    const randomPart = randomBytes(24).toString('base64url');
    const key = `${prefix}${randomPart}`;
    const hash = this.hashApiKey(key);

    return { key, hash };
  }

  /**
   * Hashes an API key for storage
   */
  hashApiKey(apiKey: string): string {
    // Use SHA-256 with a prefix to prevent rainbow table attacks
    return createHash('sha256')
      .update(`agent007_api_key:${apiKey}`)
      .digest('hex');
  }

  /**
   * Verifies an API key against its hash
   */
  verifyApiKey(apiKey: string, storedHash: string): boolean {
    const computedHash = this.hashApiKey(apiKey);

    // Use timing-safe comparison to prevent timing attacks
    try {
      return timingSafeEqual(
        Buffer.from(computedHash, 'hex'),
        Buffer.from(storedHash, 'hex')
      );
    } catch {
      return false;
    }
  }

  /**
   * Generates a nonce for replay protection
   */
  generateNonce(): string {
    const timestamp = Date.now().toString(36);
    const random = randomBytes(8).toString('hex');
    return `${timestamp}-${random}`;
  }

  /**
   * Validates a nonce format
   */
  isValidNonce(nonce: string): boolean {
    const parts = nonce.split('-');
    if (parts.length !== 2) return false;

    const [timestamp, random] = parts;
    if (!timestamp || !random) return false;

    // Check timestamp is not too old (5 minutes)
    const nonceTime = parseInt(timestamp, 36);
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    if (isNaN(nonceTime) || now - nonceTime > maxAge) {
      return false;
    }

    // Check random part is valid hex
    return /^[a-f0-9]{16}$/.test(random);
  }

  /**
   * Generates a verification code (human-readable)
   */
  generateVerificationCode(): string {
    // Format: word-XXXX (e.g., "reef-X4B2")
    const words = [
      'reef', 'wave', 'star', 'moon', 'sun', 'cloud', 'wind', 'rain',
      'fire', 'ice', 'leaf', 'tree', 'rock', 'sand', 'pearl', 'coral',
    ];

    const word = words[Math.floor(Math.random() * words.length)];
    const code = randomBytes(2).toString('hex').toUpperCase();

    return `${word}-${code}`;
  }

  /**
   * Generates a key identifier from a key
   */
  private generateKeyId(key: Buffer): string {
    return createHash('sha256').update(key).digest('hex').substring(0, 16);
  }

  /**
   * Gets information about the current key
   */
  getKeyInfo(): KeyInfo {
    return {
      keyId: this.keyId,
      createdAt: new Date(), // In production, track actual creation time
      isActive: true,
    };
  }

  /**
   * Rotates to a new master key (for key rotation support)
   */
  async rotateKey(newMasterKeyHex: string): Promise<{
    oldKeyId: string;
    newKeyId: string;
  }> {
    const oldKeyId = this.keyId;

    if (newMasterKeyHex.length !== 64) {
      throw new Error('New master key must be 32 bytes (64 hex characters)');
    }

    this.masterKey = Buffer.from(newMasterKeyHex, 'hex');
    this.keyId = this.generateKeyId(this.masterKey);

    return {
      oldKeyId,
      newKeyId: this.keyId,
    };
  }

  /**
   * Re-encrypts data with the current key
   */
  async reencrypt(encryptedData: EncryptedData): Promise<EncryptedData> {
    const decrypted = await this.decrypt(encryptedData);

    if (!decrypted.success) {
      throw new Error(`Re-encryption failed: ${decrypted.error}`);
    }

    return this.encrypt(decrypted.plaintext);
  }
}

// =============================================================================
// HASHING UTILITIES
// =============================================================================

/**
 * Creates a SHA-256 hash of the input
 */
export function sha256(input: string | Buffer): string {
  return createHash('sha256')
    .update(input)
    .digest('hex');
}

/**
 * Creates a double SHA-256 hash (for extra security on sensitive data)
 */
export function doubleSha256(input: string | Buffer): string {
  const firstHash = createHash('sha256').update(input).digest();
  return createHash('sha256').update(firstHash).digest('hex');
}

/**
 * Creates a hash with a domain separator (to prevent cross-protocol attacks)
 */
export function domainSeparatedHash(domain: string, input: string | Buffer): string {
  return createHash('sha256')
    .update(`${domain}:`)
    .update(input)
    .digest('hex');
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

let encryptionServiceInstance: EncryptionService | null = null;

/**
 * Gets or creates the encryption service singleton
 */
export function getEncryptionService(masterKeyHex?: string): EncryptionService {
  if (!encryptionServiceInstance) {
    const key = masterKeyHex || process.env.ENCRYPTION_MASTER_KEY;

    if (!key) {
      throw new Error('ENCRYPTION_MASTER_KEY environment variable is required');
    }

    encryptionServiceInstance = new EncryptionService(key);
  }

  return encryptionServiceInstance;
}

/**
 * Resets the encryption service (for testing)
 */
export function resetEncryptionService(): void {
  encryptionServiceInstance = null;
}
