#!/usr/bin/env node

/**
 * AgentID CLI for OpenClaw
 *
 * Register your OpenClaw agents on AgentID - the decentralized identity layer for AI agents.
 *
 * Usage:
 *   npx agentid-openclaw register
 *   npx agentid-openclaw verify <hash>
 *   npx agentid-openclaw status
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import nacl from 'tweetnacl';

// =============================================================================
// API RESPONSE TYPES
// =============================================================================

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

interface RegisterResponse {
  identityHash: string;
  identityType: string;
  agentName: string;
  trustScore: number;
  trustDescription: string;
  verifyUrl: string;
  createdAt: string;
  badge?: {
    markdown: string;
    html: string;
  };
}

interface AgentResponse {
  identityHash: string;
  identityType: string;
  agentName: string;
  trustScore: number;
  trustDescription: string;
  status: string;
  createdAt: string;
  anchor?: {
    chain: string;
    txHash: string;
    blockNumber: number;
  };
}

interface ProofsResponse {
  identityHash: string;
  agentName: string;
  proofs: Array<{
    type: string;
    description: string;
    verifiedAt?: string;
  }>;
  disclaimer: string;
}

interface SessionResponse {
  sessionId: string;
  identityHash: string;
  identityType: string;
  message: string;
  status: 'pending' | 'signed' | 'expired' | 'error';
  csrfToken: string;
  signature?: string;
  walletAddress?: string;
  createdAt: string;
  expiresAt: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const API_URL = process.env.AGENTID_API_URL || 'https://agent007-api-production.up.railway.app';
const WEBSITE_URL = process.env.AGENTID_WEBSITE_URL || 'https://id-agent.org';
const OPENCLAW_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'openclaw.json');
const AGENTID_DIR = path.join(os.homedir(), '.agentid');
const KEYPAIR_PATH = path.join(AGENTID_DIR, 'openclaw-keypair.json');
const POLL_INTERVAL_MS = 2000;
const SESSION_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

// =============================================================================
// UTILITIES
// =============================================================================

interface OpenClawConfig {
  agent?: {
    model?: string;
    name?: string;
  };
  skills?: string[];
  [key: string]: unknown;
}

interface Keypair {
  publicKey: string;  // base64
  secretKey: string;  // base64
  createdAt: string;
}

interface RegisteredIdentity {
  identityHash: string;
  agentName: string;
  verifyUrl: string;
  createdAt: string;
}

function ensureDir(dir: string): void {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadOpenClawConfig(): OpenClawConfig | null {
  try {
    if (fs.existsSync(OPENCLAW_CONFIG_PATH)) {
      const content = fs.readFileSync(OPENCLAW_CONFIG_PATH, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    // Ignore errors
  }
  return null;
}

function loadOrCreateKeypair(): Keypair {
  ensureDir(AGENTID_DIR);

  if (fs.existsSync(KEYPAIR_PATH)) {
    const content = fs.readFileSync(KEYPAIR_PATH, 'utf-8');
    return JSON.parse(content);
  }

  // Generate new Ed25519 keypair
  const keyPair = nacl.sign.keyPair();
  const keypair: Keypair = {
    publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
    secretKey: Buffer.from(keyPair.secretKey).toString('base64'),
    createdAt: new Date().toISOString(),
  };

  fs.writeFileSync(KEYPAIR_PATH, JSON.stringify(keypair, null, 2), { mode: 0o600 });
  return keypair;
}

function signMessage(message: string, secretKeyBase64: string): string {
  const secretKey = Buffer.from(secretKeyBase64, 'base64');
  const messageBytes = new TextEncoder().encode(message);
  const signature = nacl.sign.detached(messageBytes, secretKey);
  return Buffer.from(signature).toString('base64');
}

function loadRegisteredIdentity(): RegisteredIdentity | null {
  const identityPath = path.join(AGENTID_DIR, 'identity.json');
  try {
    if (fs.existsSync(identityPath)) {
      const content = fs.readFileSync(identityPath, 'utf-8');
      return JSON.parse(content);
    }
  } catch (error) {
    // Ignore
  }
  return null;
}

function saveRegisteredIdentity(identity: RegisteredIdentity): void {
  ensureDir(AGENTID_DIR);
  const identityPath = path.join(AGENTID_DIR, 'identity.json');
  fs.writeFileSync(identityPath, JSON.stringify(identity, null, 2));
}

// =============================================================================
// BROWSER SIGNING
// =============================================================================

function openBrowser(url: string): void {
  const platform = process.platform;
  let command: string;

  if (platform === 'darwin') {
    command = `open "${url}"`;
  } else if (platform === 'win32') {
    command = `start "" "${url}"`;
  } else {
    // Linux and others
    command = `xdg-open "${url}" || sensible-browser "${url}" || x-www-browser "${url}"`;
  }

  import('child_process').then(({ exec }) => {
    exec(command, (error) => {
      if (error) {
        console.log(chalk.yellow(`\n  Could not open browser automatically.`));
        console.log(chalk.white(`  Please open this URL manually:\n`));
        console.log(chalk.cyan(`  ${url}\n`));
      }
    });
  });
}

async function createSigningSession(
  identityHash: string,
  identityType: 'config' | 'attestation',
  agentName: string,
  model: string
): Promise<SessionResponse | null> {
  const sessionId = crypto.randomUUID();
  const message = `AgentID Registration

I am registering the following agent on AgentID:

Agent: ${agentName}
Model: ${model}
Identity Hash: ${identityHash}
Type: ${identityType}

By signing this message, I confirm that I am the owner of this agent configuration.

Timestamp: ${new Date().toISOString()}`;

  try {
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

    const data = await response.json() as ApiResponse<SessionResponse>;

    if (!response.ok || !data.data) {
      return null;
    }

    return { ...data.data, message };
  } catch {
    return null;
  }
}

async function pollSessionStatus(sessionId: string): Promise<SessionResponse | null> {
  try {
    const response = await fetch(`${API_URL}/api/v1/sessions/${sessionId}`);
    const data = await response.json() as ApiResponse<SessionResponse>;

    if (!response.ok || !data.data) {
      return null;
    }

    return data.data;
  } catch {
    return null;
  }
}

async function waitForSignature(
  sessionId: string,
  spinner: ReturnType<typeof ora>
): Promise<{ signature: string; walletAddress: string } | null> {
  const startTime = Date.now();

  while (Date.now() - startTime < SESSION_TIMEOUT_MS) {
    const session = await pollSessionStatus(sessionId);

    if (!session) {
      return null;
    }

    if (session.status === 'signed' && session.signature && session.walletAddress) {
      return {
        signature: session.signature,
        walletAddress: session.walletAddress,
      };
    }

    if (session.status === 'expired' || session.status === 'error') {
      return null;
    }

    // Update spinner
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    spinner.text = `Waiting for wallet signature... (${elapsed}s)`;

    // Wait before next poll
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  return null;
}

// Import crypto for UUID generation
import * as crypto from 'crypto';

// =============================================================================
// DISPLAY HELPERS
// =============================================================================

function displayRegistrationSuccess(data: RegisterResponse, walletAddress?: string): void {
  console.log(chalk.green.bold('\n  Registration Successful!\n'));
  console.log(chalk.white(`  Identity Hash:`));
  console.log(chalk.cyan(`  ${data.identityHash}\n`));
  console.log(chalk.white(`  Verify URL:`));
  console.log(chalk.cyan(`  ${data.verifyUrl}\n`));

  if (walletAddress) {
    console.log(chalk.white(`  Owner Wallet:`));
    console.log(chalk.cyan(`  ${walletAddress}\n`));
  }

  console.log(chalk.white(`  Trust Score: ${chalk.yellow(data.trustScore)}`));
  console.log(chalk.dim(`  ${data.trustDescription}\n`));

  if (data.badge) {
    console.log(chalk.white('  Badge (for README):'));
    console.log(chalk.dim(`  ${data.badge.markdown}\n`));
  }

  console.log(chalk.green('  Your agent is now registered on AgentID and anchoring on Base blockchain.\n'));
}

// =============================================================================
// COMMANDS
// =============================================================================

async function registerCommand(options: { name?: string; model?: string; force?: boolean; wallet?: boolean }): Promise<void> {
  const useWallet = options.wallet || false;

  console.log(chalk.green.bold('\n  AgentID - OpenClaw Registration\n'));

  if (useWallet) {
    console.log(chalk.cyan('  Mode: Wallet Signing (higher trust score)\n'));
  } else {
    console.log(chalk.dim('  Mode: Agent Keypair (use --wallet for higher trust)\n'));
  }

  // Check if already registered
  const existing = loadRegisteredIdentity();
  if (existing && !options.force) {
    console.log(chalk.yellow('  Already registered!'));
    console.log(chalk.dim(`  Identity: ${existing.identityHash.slice(0, 20)}...`));
    console.log(chalk.dim(`  Verify: ${existing.verifyUrl}`));
    console.log(chalk.dim('\n  Use --force to re-register.\n'));
    return;
  }

  // Load OpenClaw config
  const spinner = ora('Loading OpenClaw configuration...').start();
  const openclawConfig = loadOpenClawConfig();

  let agentName = options.name;
  let model = options.model;
  let skills: string[] = [];

  if (openclawConfig) {
    spinner.succeed('OpenClaw configuration found');
    agentName = agentName || openclawConfig.agent?.name || 'OpenClaw Agent';
    model = model || openclawConfig.agent?.model || 'anthropic/claude-sonnet-4';
    skills = openclawConfig.skills || [];

    console.log(chalk.dim(`  Agent: ${agentName}`));
    console.log(chalk.dim(`  Model: ${model}`));
    if (skills.length > 0) {
      console.log(chalk.dim(`  Skills: ${skills.join(', ')}`));
    }
  } else {
    spinner.warn('OpenClaw config not found, using defaults');
    agentName = agentName || 'OpenClaw Agent';
    model = model || 'anthropic/claude-sonnet-4';
  }

  // Branch based on signing method
  if (useWallet) {
    // WALLET SIGNING FLOW
    await registerWithWallet(agentName!, model!, skills);
  } else {
    // AGENT KEYPAIR FLOW
    await registerWithKeypair(agentName!, model!, skills);
  }
}

async function registerWithWallet(agentName: string, model: string, skills: string[]): Promise<void> {
  // Generate a temporary identity hash for the session
  const configHash = crypto.createHash('sha256')
    .update(JSON.stringify({ agentName, model, skills, timestamp: Date.now() }))
    .digest('hex');
  const identityHash = `0x${configHash}`;

  // Create signing session
  const sessionSpinner = ora('Creating signing session...').start();
  const session = await createSigningSession(identityHash, 'config', agentName, model);

  if (!session) {
    sessionSpinner.fail('Failed to create signing session');
    console.log(chalk.red('\n  Could not connect to AgentID API.\n'));
    process.exit(1);
  }

  sessionSpinner.succeed('Signing session created');

  // Open browser
  const signUrl = `${WEBSITE_URL}/sign?session=${session.sessionId}`;
  console.log(chalk.white('\n  Opening browser for wallet signing...\n'));
  console.log(chalk.dim(`  URL: ${signUrl}\n`));

  openBrowser(signUrl);

  console.log(chalk.yellow('  Please sign the message in your browser with MetaMask.\n'));

  // Wait for signature
  const waitSpinner = ora('Waiting for wallet signature...').start();
  const signatureResult = await waitForSignature(session.sessionId, waitSpinner);

  if (!signatureResult) {
    waitSpinner.fail('Signature timeout or error');
    console.log(chalk.red('\n  Signing was not completed in time.\n'));
    console.log(chalk.dim('  Try again with: agentid-openclaw register --wallet\n'));
    process.exit(1);
  }

  waitSpinner.succeed('Wallet signature received!');
  console.log(chalk.dim(`  Wallet: ${signatureResult.walletAddress}`));

  // Submit to API with wallet signature
  const submitSpinner = ora('Submitting to AgentID...').start();

  try {
    const response = await fetch(`${API_URL}/api/v2/agents/openclaw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'openclaw',
        agent: {
          name: agentName,
          model: model,
          skills: skills,
          capabilities: ['conversation', 'task-execution'],
        },
        signature: {
          type: 'human_wallet',
          value: signatureResult.signature,
          timestamp: new Date().toISOString(),
        },
        walletAddress: signatureResult.walletAddress,
      }),
    });

    const data = await response.json() as ApiResponse<RegisterResponse>;

    if (!response.ok || !data.data) {
      submitSpinner.fail('Registration failed');
      console.log(chalk.red(`\n  Error: ${data.error?.message || 'Unknown error'}\n`));
      process.exit(1);
    }

    submitSpinner.succeed('Registered on AgentID!');

    // Save identity
    const registeredIdentity: RegisteredIdentity = {
      identityHash: data.data.identityHash,
      agentName: agentName,
      verifyUrl: data.data.verifyUrl,
      createdAt: new Date().toISOString(),
    };
    saveRegisteredIdentity(registeredIdentity);

    // Display results
    displayRegistrationSuccess(data.data, signatureResult.walletAddress);

  } catch (error: unknown) {
    submitSpinner.fail('Registration failed');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`\n  Error: ${errorMessage}\n`));
    process.exit(1);
  }
}

async function registerWithKeypair(agentName: string, model: string, skills: string[]): Promise<void> {
  // Load or create keypair
  const keypairSpinner = ora('Loading keypair...').start();
  const keypair = loadOrCreateKeypair();
  keypairSpinner.succeed('Keypair ready');
  console.log(chalk.dim(`  Public Key: ${keypair.publicKey.slice(0, 20)}...`));

  // Create registration message
  const timestamp = new Date().toISOString();
  const message = `AgentID OpenClaw Registration\n\nAgent: ${agentName}\nModel: ${model}\nTimestamp: ${timestamp}`;

  // Sign the message
  const signSpinner = ora('Signing registration...').start();
  const signature = signMessage(message, keypair.secretKey);
  signSpinner.succeed('Message signed');

  // Submit to API
  const submitSpinner = ora('Submitting to AgentID...').start();

  try {
    const response = await fetch(`${API_URL}/api/v2/agents/openclaw`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source: 'openclaw',
        agent: {
          name: agentName,
          model: model,
          skills: skills,
          capabilities: ['conversation', 'task-execution'],
        },
        signature: {
          type: 'agent_keypair',
          value: signature,
          publicKey: keypair.publicKey,
          timestamp: timestamp,
        },
      }),
    });

    const data = await response.json() as ApiResponse<RegisterResponse>;

    if (!response.ok || !data.data) {
      submitSpinner.fail('Registration failed');
      console.log(chalk.red(`\n  Error: ${data.error?.message || 'Unknown error'}\n`));
      process.exit(1);
    }

    submitSpinner.succeed('Registered on AgentID!');

    // Save identity
    const registeredIdentity: RegisteredIdentity = {
      identityHash: data.data.identityHash,
      agentName: agentName!,
      verifyUrl: data.data.verifyUrl,
      createdAt: timestamp,
    };
    saveRegisteredIdentity(registeredIdentity);

    // Display results
    displayRegistrationSuccess(data.data);

  } catch (error: unknown) {
    submitSpinner.fail('Registration failed');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`\n  Error: ${errorMessage}\n`));
    process.exit(1);
  }
}

async function verifyCommand(hash: string): Promise<void> {
  console.log(chalk.green.bold('\n  AgentID - Verify Agent\n'));

  const spinner = ora('Fetching identity...').start();

  try {
    const response = await fetch(`${API_URL}/api/v2/agents/${hash}`);
    const data = await response.json() as ApiResponse<AgentResponse>;

    if (!response.ok || !data.data) {
      spinner.fail('Identity not found');
      console.log(chalk.red(`\n  Error: ${data.error?.message || 'Not found'}\n`));
      process.exit(1);
    }

    spinner.succeed('Identity found');

    const agent = data.data;
    console.log(chalk.white('\n  Agent Details:\n'));
    console.log(`  ${chalk.dim('Name:')}        ${chalk.white(agent.agentName)}`);
    console.log(`  ${chalk.dim('Type:')}        ${chalk.white(agent.identityType)}`);
    console.log(`  ${chalk.dim('Trust:')}       ${chalk.yellow(agent.trustScore)} ${chalk.dim(`(${agent.trustDescription})`)}`);
    console.log(`  ${chalk.dim('Status:')}      ${chalk.green(agent.status)}`);
    console.log(`  ${chalk.dim('Created:')}     ${chalk.white(agent.createdAt)}`);

    if (agent.anchor) {
      console.log(chalk.green('\n  Blockchain Anchor:'));
      console.log(`  ${chalk.dim('Chain:')}       ${chalk.white(agent.anchor.chain)}`);
      console.log(`  ${chalk.dim('TX Hash:')}    ${chalk.cyan(agent.anchor.txHash)}`);
      console.log(`  ${chalk.dim('Block:')}      ${chalk.white(agent.anchor.blockNumber)}`);
    }

    console.log(chalk.dim(`\n  View: https://id-agent.org/verify/${hash}\n`));

  } catch (error: unknown) {
    spinner.fail('Verification failed');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`\n  Error: ${errorMessage}\n`));
    process.exit(1);
  }
}

async function statusCommand(): Promise<void> {
  console.log(chalk.green.bold('\n  AgentID - Status\n'));

  const identity = loadRegisteredIdentity();

  if (!identity) {
    console.log(chalk.yellow('  Not registered yet.'));
    console.log(chalk.dim('  Run: agentid-openclaw register\n'));
    return;
  }

  console.log(chalk.white('  Local Identity:\n'));
  console.log(`  ${chalk.dim('Hash:')}      ${chalk.cyan(identity.identityHash.slice(0, 30))}...`);
  console.log(`  ${chalk.dim('Name:')}      ${chalk.white(identity.agentName)}`);
  console.log(`  ${chalk.dim('Created:')}   ${chalk.white(identity.createdAt)}`);

  // Fetch latest status from API
  const spinner = ora('Checking online status...').start();

  try {
    const response = await fetch(`${API_URL}/api/v2/agents/${identity.identityHash}`);
    const data = await response.json() as ApiResponse<AgentResponse>;

    if (response.ok && data.data) {
      spinner.succeed('Online status retrieved');
      const agent = data.data;
      console.log(chalk.green('\n  API Status:'));
      console.log(`  ${chalk.dim('Trust:')}      ${chalk.yellow(agent.trustScore)}`);
      console.log(`  ${chalk.dim('Status:')}     ${chalk.green(agent.status)}`);

      if (agent.anchor) {
        console.log(`  ${chalk.dim('Anchored:')}   ${chalk.green('Yes')} (Block ${agent.anchor.blockNumber})`);
      } else {
        console.log(`  ${chalk.dim('Anchored:')}   ${chalk.yellow('Pending...')}`);
      }
    } else {
      spinner.warn('Could not fetch online status');
    }
  } catch {
    spinner.warn('Could not connect to API');
  }

  console.log(chalk.dim(`\n  Verify: ${identity.verifyUrl}\n`));
}

async function proofsCommand(hash?: string): Promise<void> {
  const identity = loadRegisteredIdentity();
  const targetHash = hash || identity?.identityHash;

  if (!targetHash) {
    console.log(chalk.yellow('\n  No identity hash provided.'));
    console.log(chalk.dim('  Usage: agentid-openclaw proofs <hash>\n'));
    return;
  }

  console.log(chalk.green.bold('\n  AgentID - Proofs\n'));

  const spinner = ora('Fetching proofs...').start();

  try {
    const response = await fetch(`${API_URL}/api/v2/agents/${targetHash}/proofs`);
    const data = await response.json() as ApiResponse<ProofsResponse>;

    if (!response.ok || !data.data) {
      spinner.fail('Could not fetch proofs');
      console.log(chalk.red(`\n  Error: ${data.error?.message || 'Not found'}\n`));
      return;
    }

    spinner.succeed('Proofs retrieved');

    const proofs = data.data;
    console.log(chalk.white(`\n  Proofs for ${proofs.agentName}:\n`));

    for (const proof of proofs.proofs) {
      console.log(`  ${chalk.green('✓')} ${chalk.white(proof.type)}`);
      console.log(chalk.dim(`    ${proof.description}`));
      if (proof.verifiedAt) {
        console.log(chalk.dim(`    Verified: ${proof.verifiedAt}`));
      }
      console.log();
    }

    console.log(chalk.dim(`  ${proofs.disclaimer}\n`));

  } catch (error: unknown) {
    spinner.fail('Failed to fetch proofs');
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.log(chalk.red(`\n  Error: ${errorMessage}\n`));
  }
}

// =============================================================================
// CLI SETUP
// =============================================================================

const program = new Command();

program
  .name('agentid-openclaw')
  .description('AgentID CLI for OpenClaw - Register your AI agents on the blockchain')
  .version('1.0.0');

program
  .command('register')
  .description('Register your OpenClaw agent with AgentID')
  .option('-n, --name <name>', 'Agent name (overrides config)')
  .option('-m, --model <model>', 'Model identifier (e.g., anthropic/claude-opus-4-5)')
  .option('-f, --force', 'Force re-registration')
  .option('-w, --wallet', 'Sign with MetaMask wallet (higher trust score)')
  .action(registerCommand);

program
  .command('verify <hash>')
  .description('Verify an agent identity')
  .action(verifyCommand);

program
  .command('status')
  .description('Check your registration status')
  .action(statusCommand);

program
  .command('proofs [hash]')
  .description('View proofs for an identity')
  .action(proofsCommand);

program.parse();
