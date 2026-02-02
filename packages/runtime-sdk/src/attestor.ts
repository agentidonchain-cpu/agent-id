/**
 * @agentid/runtime-sdk
 * RuntimeAttestor - Main class for handling attestation challenges
 */

import {
  generateRuntimeHashes,
  sign,
  createAttestationMessage,
  getPublicKey,
} from './crypto.js';
import type {
  AttestorConfig,
  Challenge,
  RuntimeAttestation,
  AttestationResult,
  AttestationStatus,
  DriftReport,
  AttestorEvent,
  EventHandler,
} from './types.js';

// =============================================================================
// RUNTIME ATTESTOR
// =============================================================================

/**
 * RuntimeAttestor handles challenge-response for proving agent identity
 *
 * @example
 * ```typescript
 * import { RuntimeAttestor } from '@agentid/runtime-sdk';
 *
 * const attestor = new RuntimeAttestor({
 *   identityHash: '0x...',
 *   privateKey: '...',
 *   publicKey: '...',
 *   getConfig: () => ({
 *     fullConfig: myAgentConfig,
 *     systemPrompt: 'You are...',
 *     tools: ['search', 'calculate'],
 *     model: { name: 'gpt-4', version: '0125-preview' }
 *   })
 * });
 *
 * // Handle a challenge
 * const attestation = await attestor.handleChallenge(challenge);
 *
 * // Or run self-verification
 * const drift = await attestor.selfVerify();
 * ```
 */
export class RuntimeAttestor {
  private config: AttestorConfig;
  private apiUrl: string;
  private startTime: number;
  private eventHandlers: EventHandler[] = [];
  private selfVerifyTimer?: NodeJS.Timeout;

  constructor(config: AttestorConfig) {
    this.config = config;
    this.apiUrl = config.apiUrl || 'https://api.id-agent.org';
    this.startTime = Date.now();

    // Validate keys
    if (!config.privateKey || !config.publicKey) {
      throw new Error('Both privateKey and publicKey are required');
    }

    // Verify key pair matches
    const derivedPublic = getPublicKey(config.privateKey);
    if (derivedPublic !== config.publicKey) {
      throw new Error('Public key does not match private key');
    }

    // Start self-verification interval if configured
    if (config.selfVerifyInterval && config.selfVerifyInterval > 0) {
      this.startSelfVerify(config.selfVerifyInterval);
    }
  }

  // ===========================================================================
  // EVENT HANDLING
  // ===========================================================================

  /**
   * Subscribe to attestor events
   */
  on(handler: EventHandler): () => void {
    this.eventHandlers.push(handler);
    return () => {
      const index = this.eventHandlers.indexOf(handler);
      if (index > -1) {
        this.eventHandlers.splice(index, 1);
      }
    };
  }

  private emit(event: AttestorEvent): void {
    for (const handler of this.eventHandlers) {
      try {
        handler(event);
      } catch (error) {
        console.error('[RuntimeAttestor] Event handler error:', error);
      }
    }
  }

  // ===========================================================================
  // CHALLENGE HANDLING
  // ===========================================================================

  /**
   * Handle an incoming challenge and generate attestation
   */
  async handleChallenge(challenge: Challenge): Promise<RuntimeAttestation> {
    this.emit({ type: 'challenge_received', challenge });

    // Verify challenge is for us
    if (challenge.targetIdentityHash.toLowerCase() !== this.config.identityHash.toLowerCase()) {
      throw new Error('Challenge is not for this agent');
    }

    // Check expiration
    if (new Date(challenge.expiresAt) < new Date()) {
      throw new Error('Challenge has expired');
    }

    const challengedAt = new Date().toISOString();

    // Get current config and generate hashes
    const agentConfig = await this.config.getConfig();
    const hashes = generateRuntimeHashes(agentConfig);

    // Build runtime snapshot
    const runtime = {
      hashes,
      timestamp: new Date().toISOString(),
      agentVersion: agentConfig.version,
      platform: agentConfig.platform,
      uptimeSeconds: Math.floor((Date.now() - this.startTime) / 1000),
    };

    // Create message to sign
    const message = createAttestationMessage(
      this.config.identityHash,
      runtime,
      { challengeId: challenge.challengeId, nonce: challenge.nonce }
    );

    // Sign the message
    const signature = sign(message, this.config.privateKey);

    const respondedAt = new Date().toISOString();

    // Build attestation
    const attestation: RuntimeAttestation = {
      registeredIdentityHash: this.config.identityHash,
      runtime,
      challenge: {
        challengeId: challenge.challengeId,
        nonce: challenge.nonce,
        challengedAt,
        respondedAt,
      },
      proof: {
        type: 'ed25519',
        signature,
        publicKey: this.config.publicKey,
      },
    };

    return attestation;
  }

  /**
   * Handle a challenge and submit to API
   */
  async handleChallengeAndSubmit(challenge: Challenge): Promise<AttestationResult> {
    try {
      const attestation = await this.handleChallenge(challenge);

      this.emit({ type: 'attestation_sent', challengeId: challenge.challengeId });

      // Submit to API
      const response = await fetch(`${this.apiUrl}/api/v1/runtime/attest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          challengeId: challenge.challengeId,
          attestation,
        }),
      });

      const result = await response.json() as {
        success: boolean;
        data?: { verified?: boolean; drift?: DriftReport; warnings?: string[] };
        error?: { message?: string };
      };

      if (!response.ok || !result.success) {
        const error = result.error?.message || 'Attestation failed';
        this.emit({ type: 'attestation_failed', error });
        return { success: false, error };
      }

      this.emit({ type: 'attestation_verified', result: { success: true, ...result.data } });
      return { success: true, ...result.data };
    } catch (error: any) {
      const message = error.message || 'Unknown error';
      this.emit({ type: 'attestation_failed', error: message });
      return { success: false, error: message };
    }
  }

  // ===========================================================================
  // SELF VERIFICATION
  // ===========================================================================

  /**
   * Request a challenge and self-verify
   */
  async selfVerify(): Promise<DriftReport> {
    try {
      // Request a challenge
      const challengeResponse = await fetch(`${this.apiUrl}/api/v1/runtime/challenge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetIdentityHash: this.config.identityHash,
        }),
      });

      const challengeResult = await challengeResponse.json() as {
        success: boolean;
        data?: Challenge;
        error?: { message?: string };
      };

      if (!challengeResponse.ok || !challengeResult.success) {
        throw new Error(challengeResult.error?.message || 'Failed to get challenge');
      }

      const challenge: Challenge = challengeResult.data!;

      // Handle and submit
      const result = await this.handleChallengeAndSubmit(challenge);

      if (!result.success || !result.drift) {
        throw new Error(result.error || 'Self verification failed');
      }

      this.emit({ type: 'self_verify_complete', drift: result.drift });
      return result.drift;
    } catch (error: any) {
      this.emit({ type: 'error', error: error.message });
      throw error;
    }
  }

  /**
   * Start periodic self-verification
   */
  startSelfVerify(intervalMs: number): void {
    if (this.selfVerifyTimer) {
      clearInterval(this.selfVerifyTimer);
    }

    this.selfVerifyTimer = setInterval(async () => {
      try {
        await this.selfVerify();
      } catch (error) {
        console.error('[RuntimeAttestor] Self-verify failed:', error);
      }
    }, intervalMs);
  }

  /**
   * Stop periodic self-verification
   */
  stopSelfVerify(): void {
    if (this.selfVerifyTimer) {
      clearInterval(this.selfVerifyTimer);
      this.selfVerifyTimer = undefined;
    }
  }

  // ===========================================================================
  // STATUS
  // ===========================================================================

  /**
   * Get attestation status from API
   */
  async getStatus(): Promise<AttestationStatus> {
    const response = await fetch(
      `${this.apiUrl}/api/v1/runtime/status/${this.config.identityHash}`
    );

    const result = await response.json() as {
      success: boolean;
      data?: AttestationStatus;
      error?: { message?: string };
    };

    if (!response.ok || !result.success) {
      throw new Error(result.error?.message || 'Failed to get status');
    }

    return result.data!;
  }

  /**
   * Get current uptime in seconds
   */
  getUptime(): number {
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * Get the agent's identity hash
   */
  getIdentityHash(): string {
    return this.config.identityHash;
  }

  /**
   * Clean up resources
   */
  destroy(): void {
    this.stopSelfVerify();
    this.eventHandlers = [];
  }
}
