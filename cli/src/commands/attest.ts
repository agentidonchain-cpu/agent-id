/**
 * Attest command
 * Creates an attestation identity for closed platform agents
 */

import { createHash } from 'crypto';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

interface AttestOptions {
  api: string;
  platform?: string;
  id?: string;
  name?: string;
}

interface AttestationData {
  platform: string;
  agentIdentifier: string;
  declaredName: string;
  declaredCapabilities: string[];
}

interface SignatureResult {
  signature: string;
  walletAddress: string;
  timestamp: string;
  message: string;
}

// Attestation message template
const ATTESTATION_MESSAGE = `AgentID Attestation Registration

I attest that I operate the following agent:

Platform: {platform}
Agent ID: {agentIdentifier}
Name: {declaredName}

Identity Hash: {identityHash}
Chain: Base Mainnet (8453)
Timestamp: {timestamp}

This is a declaration, not a verified configuration.`;

// Known platforms
const PLATFORMS = [
  { name: 'ChatGPT (Custom GPTs)', value: 'chatgpt' },
  { name: 'Character.AI', value: 'character.ai' },
  { name: 'Claude.ai', value: 'claude.ai' },
  { name: 'Poe', value: 'poe' },
  { name: 'HuggingFace', value: 'huggingface' },
  { name: 'Replicate', value: 'replicate' },
  { name: 'Other (custom)', value: 'other' },
];

export async function attest(options: AttestOptions): Promise<void> {
  console.log();
  console.log(chalk.bold.yellow('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.yellow('║') + chalk.bold('           AgentID - Attestation Registration             ') + chalk.bold.yellow('║'));
  console.log(chalk.bold.yellow('╚════════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.white('Create an attestation for an agent on a closed platform.'));
  console.log(chalk.dim('This proves YOU claim to operate this agent - it does NOT verify'));
  console.log(chalk.dim('the agent\'s configuration or behavior.'));
  console.log();
  console.log(chalk.bold.yellow('⚠ ATTESTATION vs CONFIG:'));
  console.log(chalk.dim('  • Config Identity: Verified configuration (use "register")'));
  console.log(chalk.dim('  • Attestation:    Declaration of ownership (use "attest")'));
  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  // Check for private key
  const privateKey = process.env.AGENTID_PRIVATE_KEY;
  if (privateKey) {
    console.log(chalk.dim('Signing method: ') + chalk.green('CLI (using AGENTID_PRIVATE_KEY)'));
  } else {
    console.log(chalk.dim('Signing method: ') + chalk.yellow('Browser (MetaMask)'));
    console.log(chalk.dim('TIP: Set AGENTID_PRIVATE_KEY for automated signing'));
  }
  console.log();

  // Collect attestation data
  const attestation = await collectAttestationData(options);

  // Generate identity hash
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.cyan('STEP 2: GENERATING ATTESTATION HASH'));
  console.log();

  const timestamp = new Date().toISOString();
  const hashSpinner = ora('Computing attestation hash...').start();

  // Get wallet address first (needed for hash)
  let walletAddress: string;
  if (privateKey) {
    const { Wallet } = await import('ethers');
    const wallet = new Wallet(privateKey);
    walletAddress = wallet.address.toLowerCase();
  } else {
    // For browser signing, we'll get it after signing
    // Use a placeholder for now and recompute after
    walletAddress = '0x0000000000000000000000000000000000000000';
  }

  const identityHash = computeAttestationHash({
    platform: attestation.platform,
    agentIdentifier: attestation.agentIdentifier,
    owner: walletAddress,
    signedAt: timestamp,
  });

  hashSpinner.succeed('Attestation hash generated');
  console.log();
  console.log(chalk.bold('Attestation Identity Hash:'));
  console.log(chalk.bold.yellow(`  ${identityHash}`));
  console.log();
  console.log(chalk.dim('This hash uniquely identifies your attestation.'));
  console.log();

  // Sign the attestation
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.cyan('STEP 3: SIGNING ATTESTATION'));
  console.log();

  let signatureResult: SignatureResult;

  if (privateKey) {
    signatureResult = await signWithPrivateKey(identityHash, attestation, timestamp, privateKey);
  } else {
    signatureResult = await signWithBrowser(identityHash, attestation, timestamp, options.api);
    // Recompute hash with actual wallet address
    const actualHash = computeAttestationHash({
      platform: attestation.platform,
      agentIdentifier: attestation.agentIdentifier,
      owner: signatureResult.walletAddress,
      signedAt: timestamp,
    });
    console.log(chalk.dim('Updated hash with wallet: ') + chalk.yellow(actualHash.slice(0, 20) + '...'));
  }

  console.log();
  console.log(chalk.bold('Signature Details:'));
  console.log(chalk.dim('  Wallet:    ') + chalk.white(signatureResult.walletAddress));
  console.log(chalk.dim('  Timestamp: ') + chalk.white(signatureResult.timestamp));
  console.log();

  // Register attestation with API
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.cyan('STEP 4: REGISTERING ATTESTATION'));
  console.log();

  const registerSpinner = ora('Submitting attestation...').start();

  try {
    await registerAttestation(options.api, attestation, {
      identityHash,
      signature: signatureResult.signature,
      walletAddress: signatureResult.walletAddress,
      timestamp: signatureResult.timestamp,
    });

    registerSpinner.succeed('Attestation registered!');

    // Final output
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold.yellow('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.yellow('║') + chalk.bold.yellow('              ✓ ATTESTATION COMPLETE                       ') + chalk.bold.yellow('║'));
    console.log(chalk.bold.yellow('╚════════════════════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.bold('Summary:'));
    console.log(chalk.dim('  Platform:      ') + chalk.white(attestation.platform));
    console.log(chalk.dim('  Agent ID:      ') + chalk.white(attestation.agentIdentifier));
    console.log(chalk.dim('  Name:          ') + chalk.white(attestation.declaredName));
    console.log(chalk.dim('  Identity Hash: ') + chalk.yellow(identityHash));
    console.log(chalk.dim('  Owner:         ') + chalk.white(signatureResult.walletAddress));
    console.log(chalk.dim('  Type:          ') + chalk.yellow('ATTESTATION (declared)'));
    console.log(chalk.dim('  Cost:          ') + chalk.green('FREE'));
    console.log();
    console.log(chalk.bold.red('⚠ IMPORTANT:'));
    console.log(chalk.dim('  This attestation proves YOU declared this agent.'));
    console.log(chalk.dim('  It does NOT verify the agent\'s actual configuration.'));
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold.white('WHAT TO DO NOW:'));
    console.log();
    console.log(chalk.white('  1. ') + chalk.dim('View your attestation:'));
    console.log(chalk.cyan(`     https://id-agent.org/verify/${identityHash}`));
    console.log();
    console.log(chalk.white('  2. ') + chalk.dim('Generate a QR code:'));
    console.log(chalk.cyan(`     npx agentidbase qr ${identityHash}`));
    console.log();

  } catch (error: any) {
    registerSpinner.fail('Attestation failed');
    console.log();
    console.log(chalk.red('Error: ' + error.message));
    process.exit(1);
  }
}

async function collectAttestationData(options: AttestOptions): Promise<AttestationData> {
  console.log(chalk.bold.cyan('STEP 1: ATTESTATION DETAILS'));
  console.log();

  // Platform selection
  let platform = options.platform;
  if (!platform) {
    const platformAnswer = await inquirer.prompt([
      {
        type: 'list',
        name: 'platform',
        message: 'Select the platform:',
        choices: PLATFORMS,
      },
    ]);
    platform = platformAnswer.platform;

    if (platform === 'other') {
      const customPlatform = await inquirer.prompt([
        {
          type: 'input',
          name: 'platform',
          message: 'Enter platform name:',
          validate: (input: string) => input.length > 0 || 'Platform name is required',
        },
      ]);
      platform = customPlatform.platform;
    }
  }
  console.log(chalk.dim('Platform: ') + chalk.white(platform));
  console.log();

  // Agent identifier
  let agentIdentifier = options.id;
  if (!agentIdentifier) {
    const idAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'agentId',
        message: 'Agent URL or ID (e.g., https://chat.openai.com/g/g-abc123):',
        validate: (input: string) => input.length > 0 || 'Agent ID is required',
      },
    ]);
    agentIdentifier = idAnswer.agentId;
  }
  console.log(chalk.dim('Agent ID: ') + chalk.white(agentIdentifier));
  console.log();

  // Agent name
  let declaredName = options.name;
  if (!declaredName) {
    const nameAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Agent name:',
        validate: (input: string) => input.length > 0 || 'Name is required',
      },
    ]);
    declaredName = nameAnswer.name;
  }
  console.log(chalk.dim('Name: ') + chalk.white(declaredName));
  console.log();

  // Capabilities (optional)
  const capabilitiesAnswer = await inquirer.prompt([
    {
      type: 'input',
      name: 'capabilities',
      message: 'Capabilities (comma-separated, optional):',
      default: '',
    },
  ]);

  const declaredCapabilities = capabilitiesAnswer.capabilities
    .split(',')
    .map((c: string) => c.trim())
    .filter((c: string) => c.length > 0);

  if (declaredCapabilities.length > 0) {
    console.log(chalk.dim('Capabilities: ') + chalk.white(declaredCapabilities.join(', ')));
  }
  console.log();

  return {
    platform: platform!,
    agentIdentifier: agentIdentifier!,
    declaredName: declaredName!,
    declaredCapabilities,
  };
}

function computeAttestationHash(params: {
  platform: string;
  agentIdentifier: string;
  owner: string;
  signedAt: string;
}): string {
  const input = `attestation:1.0|${params.platform}|${params.agentIdentifier}|${params.owner}|${params.signedAt}`;
  return '0x' + createHash('sha256').update(input).digest('hex');
}

async function signWithPrivateKey(
  identityHash: string,
  attestation: AttestationData,
  timestamp: string,
  privateKey: string
): Promise<SignatureResult> {
  const spinner = ora('Signing attestation...').start();

  try {
    const { Wallet } = await import('ethers');
    const wallet = new Wallet(privateKey);

    const message = ATTESTATION_MESSAGE
      .replace('{platform}', attestation.platform)
      .replace('{agentIdentifier}', attestation.agentIdentifier)
      .replace('{declaredName}', attestation.declaredName)
      .replace('{identityHash}', identityHash)
      .replace('{timestamp}', timestamp);

    const signature = await wallet.signMessage(message);

    spinner.succeed(`Signed with wallet ${wallet.address.slice(0, 8)}...`);

    return {
      signature,
      walletAddress: wallet.address.toLowerCase(),
      timestamp,
      message,
    };
  } catch (error: any) {
    spinner.fail('Signing failed');
    console.log(chalk.red('Error: ' + error.message));
    process.exit(1);
  }
}

async function signWithBrowser(
  identityHash: string,
  attestation: AttestationData,
  timestamp: string,
  apiUrl: string
): Promise<SignatureResult> {
  const { browserSign } = await import('../utils/browser-sign.js');

  const message = ATTESTATION_MESSAGE
    .replace('{platform}', attestation.platform)
    .replace('{agentIdentifier}', attestation.agentIdentifier)
    .replace('{declaredName}', attestation.declaredName)
    .replace('{identityHash}', identityHash)
    .replace('{timestamp}', timestamp);

  try {
    const result = await browserSign(identityHash, 'attestation', message);
    return {
      ...result,
      message,
    };
  } catch (error: any) {
    console.log(chalk.red('Browser signing failed: ' + error.message));
    console.log(chalk.yellow('Set AGENTID_PRIVATE_KEY for CLI signing'));
    process.exit(1);
  }
}

async function registerAttestation(
  apiUrl: string,
  attestation: AttestationData,
  signatureData: {
    identityHash: string;
    signature: string;
    walletAddress: string;
    timestamp: string;
  }
): Promise<void> {
  const response = await fetch(`${apiUrl}/api/v1/agents/register/attestation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      platform: attestation.platform,
      agentIdentifier: attestation.agentIdentifier,
      declaredName: attestation.declaredName,
      declaredCapabilities: attestation.declaredCapabilities,
      identityHash: signatureData.identityHash,
      signature: signatureData.signature,
      walletAddress: signatureData.walletAddress,
      timestamp: signatureData.timestamp,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Registration failed' }));
    throw new Error(error.message || error.error?.message || 'Attestation failed');
  }
}
