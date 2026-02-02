/**
 * Browser Signing Utility
 * Handles the flow of opening browser for MetaMask signing and polling for result
 */

import { randomBytes } from 'crypto';
import chalk from 'chalk';
import ora from 'ora';
import open from 'open';

const API_URL = process.env.AGENTID_API_URL || 'https://agent007-api-production.up.railway.app';
const WEBSITE_URL = process.env.AGENTID_WEBSITE_URL || 'https://id-agent.org';

export interface SigningSession {
  sessionId: string;
  identityHash: string;
  identityType: 'config' | 'attestation';
  message: string;
  status: 'pending' | 'signed' | 'expired' | 'error';
  signature?: string;
  walletAddress?: string;
  timestamp?: string;
  createdAt: string;
  expiresAt: string;
}

/**
 * Generate a unique session ID
 */
export function generateSessionId(): string {
  return randomBytes(16).toString('hex');
}

/**
 * Create a signing session on the API
 */
export async function createSigningSession(
  identityHash: string,
  identityType: 'config' | 'attestation',
  message: string
): Promise<SigningSession> {
  const sessionId = generateSessionId();

  const response = await fetch(`${API_URL}/api/v1/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      sessionId,
      identityHash,
      identityType,
      message,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Failed to create session' }));
    throw new Error(error.message || 'Failed to create signing session');
  }

  return response.json();
}

/**
 * Get signing session status
 */
export async function getSigningSession(sessionId: string): Promise<SigningSession> {
  const response = await fetch(`${API_URL}/api/v1/sessions/${sessionId}`);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error('Session not found or expired');
    }
    throw new Error('Failed to get session status');
  }

  return response.json();
}

/**
 * Open browser for signing
 */
export async function openSigningPage(sessionId: string): Promise<void> {
  const url = `${WEBSITE_URL}/sign?session=${sessionId}`;
  console.log();
  console.log(chalk.dim('Opening browser for wallet signing...'));
  console.log(chalk.cyan(`  ${url}`));
  console.log();

  try {
    await open(url);
  } catch (error) {
    console.log(chalk.yellow('Could not open browser automatically.'));
    console.log(chalk.white('Please open this URL manually:'));
    console.log(chalk.cyan(`  ${url}`));
  }
}

/**
 * Poll for signature result
 */
export async function pollForSignature(
  sessionId: string,
  options: {
    maxWaitMs?: number;
    pollIntervalMs?: number;
    onPoll?: (attempt: number) => void;
  } = {}
): Promise<{ signature: string; walletAddress: string; timestamp: string }> {
  const {
    maxWaitMs = 5 * 60 * 1000, // 5 minutes
    pollIntervalMs = 2000, // 2 seconds
  } = options;

  const startTime = Date.now();
  let attempt = 0;

  while (Date.now() - startTime < maxWaitMs) {
    attempt++;
    options.onPoll?.(attempt);

    try {
      const session = await getSigningSession(sessionId);

      if (session.status === 'signed' && session.signature && session.walletAddress) {
        return {
          signature: session.signature,
          walletAddress: session.walletAddress,
          timestamp: session.timestamp || new Date().toISOString(),
        };
      }

      if (session.status === 'expired') {
        throw new Error('Signing session expired');
      }

      if (session.status === 'error') {
        throw new Error('Signing failed');
      }
    } catch (error: any) {
      if (error.message.includes('expired') || error.message.includes('not found')) {
        throw error;
      }
      // Network error, continue polling
    }

    await sleep(pollIntervalMs);
  }

  throw new Error('Signing timeout - session expired');
}

/**
 * Complete browser signing flow
 */
export async function browserSign(
  identityHash: string,
  identityType: 'config' | 'attestation',
  message: string
): Promise<{ signature: string; walletAddress: string; timestamp: string }> {
  // Create session
  const spinner = ora('Creating signing session...').start();

  try {
    const session = await createSigningSession(identityHash, identityType, message);
    spinner.succeed('Signing session created');

    // Open browser
    await openSigningPage(session.sessionId);

    // Poll for result
    const pollSpinner = ora('Waiting for signature...').start();
    let dots = 0;

    const result = await pollForSignature(session.sessionId, {
      onPoll: (attempt) => {
        dots = (dots + 1) % 4;
        pollSpinner.text = `Waiting for signature${'.'.repeat(dots)}`;
      },
    });

    pollSpinner.succeed(`Signature received from ${result.walletAddress.slice(0, 8)}...`);

    return result;
  } catch (error: any) {
    spinner.fail('Signing failed');
    throw error;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
  generateSessionId,
  createSigningSession,
  getSigningSession,
  openSigningPage,
  pollForSignature,
  browserSign,
};
