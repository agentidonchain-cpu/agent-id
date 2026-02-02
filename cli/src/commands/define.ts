/**
 * Define command
 * Creates a fingerprint identity from agent configuration
 * For open/self-hosted agents where config is accessible
 */

import { createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

interface DefineOptions {
  config?: string;
  api: string;
  storeConfig?: boolean;
}

interface AgentConfig {
  name: string;
  model: {
    provider: string;
    modelId: string;
  };
  systemPrompt?: string;
  parameters?: Record<string, unknown>;
  tools?: Array<{ name: string; description: string }>;
}

interface SignatureResult {
  signature: string;
  walletAddress: string;
  timestamp: string;
  message: string;
}

// Fingerprint message template
const FINGERPRINT_MESSAGE = `AgentID Fingerprint Registration

Agent: {agentName}
Provider: {provider}
Model: {modelId}
System Prompt Hash: {systemPromptHash}

Identity Hash: {identityHash}
Chain: Base Mainnet (8453)
Timestamp: {timestamp}

This fingerprint can be verified by recomputing the hash from config.`;

export async function define(options: DefineOptions): Promise<void> {
  console.log();
  console.log(chalk.bold.cyan('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║') + chalk.bold('           AgentID - Fingerprint Registration             ') + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.white('Create a verifiable fingerprint from your agent\'s configuration.'));
  console.log(chalk.dim('This creates a cryptographic hash that can be verified by anyone'));
  console.log(chalk.dim('with access to the same configuration.'));
  console.log();
  console.log(chalk.bold.cyan('BEST FOR:'));
  console.log(chalk.dim('  • Open source agents'));
  console.log(chalk.dim('  • Self-hosted agents'));
  console.log(chalk.dim('  • Agents with accessible configuration'));
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

  // Load configuration
  console.log(chalk.bold.cyan('STEP 1: LOAD CONFIGURATION'));
  console.log();

  const config = await loadConfig(options);

  console.log(chalk.bold('Configuration loaded:'));
  console.log(chalk.dim('  Name:     ') + chalk.white(config.name));
  console.log(chalk.dim('  Provider: ') + chalk.white(config.model.provider));
  console.log(chalk.dim('  Model:    ') + chalk.white(config.model.modelId));
  if (config.systemPrompt) {
    console.log(chalk.dim('  Prompt:   ') + chalk.white(config.systemPrompt.slice(0, 50) + (config.systemPrompt.length > 50 ? '...' : '')));
  }
  console.log();

  // Ask about storing config
  let storeConfig = options.storeConfig;
  if (storeConfig === undefined) {
    const storeAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'storeConfig',
        message: 'Store full config for verification? (allows others to verify)',
        default: false,
      },
    ]);
    storeConfig = storeAnswer.storeConfig;
  }

  if (storeConfig) {
    console.log(chalk.yellow('⚠ Your system prompt will be stored and visible to others.'));
  } else {
    console.log(chalk.green('✓ Only the hash will be stored. Config stays private.'));
  }
  console.log();

  // Generate fingerprint hash
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.cyan('STEP 2: GENERATING FINGERPRINT HASH'));
  console.log();

  const timestamp = new Date().toISOString();
  const hashSpinner = ora('Computing fingerprint hash...').start();

  const systemPromptHash = config.systemPrompt
    ? createHash('sha256').update(config.systemPrompt).digest('hex')
    : undefined;

  const identityHash = computeFingerprintHash({
    model: config.model,
    systemPromptHash,
  });

  hashSpinner.succeed('Fingerprint hash generated');
  console.log();
  console.log(chalk.bold('Fingerprint Identity Hash:'));
  console.log(chalk.bold.cyan(`  ${identityHash}`));
  console.log();
  if (systemPromptHash) {
    console.log(chalk.dim('System Prompt Hash: ') + chalk.white(systemPromptHash.slice(0, 20) + '...'));
  }
  console.log();

  // Sign the fingerprint
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.cyan('STEP 3: SIGNING FINGERPRINT'));
  console.log();

  let signatureResult: SignatureResult;

  if (privateKey) {
    signatureResult = await signWithPrivateKey(identityHash, config, systemPromptHash, timestamp, privateKey);
  } else {
    signatureResult = await signWithBrowser(identityHash, config, systemPromptHash, timestamp, options.api);
  }

  console.log();
  console.log(chalk.bold('Signature Details:'));
  console.log(chalk.dim('  Wallet:    ') + chalk.white(signatureResult.walletAddress));
  console.log(chalk.dim('  Timestamp: ') + chalk.white(signatureResult.timestamp));
  console.log();

  // Register fingerprint with API
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.cyan('STEP 4: REGISTERING FINGERPRINT'));
  console.log();

  const registerSpinner = ora('Submitting fingerprint...').start();

  try {
    await registerFingerprint(options.api, config, {
      identityHash,
      systemPromptHash,
      storeConfig: storeConfig ?? false,
      signature: signatureResult.signature,
      walletAddress: signatureResult.walletAddress,
      timestamp: signatureResult.timestamp,
    });

    registerSpinner.succeed('Fingerprint registered!');

    // Final output
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold.cyan('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.cyan('║') + chalk.bold.cyan('           ✓ FINGERPRINT REGISTRATION COMPLETE            ') + chalk.bold.cyan('║'));
    console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.bold('Summary:'));
    console.log(chalk.dim('  Agent:         ') + chalk.white(config.name));
    console.log(chalk.dim('  Provider:      ') + chalk.white(config.model.provider));
    console.log(chalk.dim('  Model:         ') + chalk.white(config.model.modelId));
    console.log(chalk.dim('  Identity Hash: ') + chalk.cyan(identityHash));
    console.log(chalk.dim('  Owner:         ') + chalk.white(signatureResult.walletAddress));
    console.log(chalk.dim('  Type:          ') + chalk.cyan('FINGERPRINT (verifiable config)'));
    console.log(chalk.dim('  Config Stored: ') + chalk.white(storeConfig ? 'Yes' : 'No (hash only)'));
    console.log(chalk.dim('  Cost:          ') + chalk.green('FREE'));
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold.white('WHAT TO DO NOW:'));
    console.log();
    console.log(chalk.white('  1. ') + chalk.dim('View your fingerprint:'));
    console.log(chalk.cyan(`     https://id-agent.org/verify/${identityHash}`));
    console.log();
    console.log(chalk.white('  2. ') + chalk.dim('Anchor on-chain (optional):'));
    console.log(chalk.cyan(`     npx agentidbase anchor ${identityHash}`));
    console.log();
    console.log(chalk.white('  3. ') + chalk.dim('Generate QR code:'));
    console.log(chalk.cyan(`     npx agentidbase qr ${identityHash}`));
    console.log();

  } catch (error: any) {
    registerSpinner.fail('Registration failed');
    console.log();
    console.log(chalk.red('Error: ' + error.message));
    process.exit(1);
  }
}

async function loadConfig(options: DefineOptions): Promise<AgentConfig> {
  // Try to find config file
  let configPath = options.config;

  if (!configPath) {
    // Look for agent.json in current directory
    const defaultPath = path.join(process.cwd(), 'agent.json');
    if (fs.existsSync(defaultPath)) {
      configPath = defaultPath;
      console.log(chalk.dim('Found: ') + chalk.cyan(configPath));
    } else {
      // Ask user
      const configAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'configPath',
          message: 'Path to agent.json:',
          default: 'agent.json',
          validate: (input: string) => {
            const fullPath = path.isAbsolute(input) ? input : path.join(process.cwd(), input);
            if (!fs.existsSync(fullPath)) {
              return `File not found: ${fullPath}`;
            }
            return true;
          },
        },
      ]);
      configPath = configAnswer.configPath;
    }
  }

  const fullPath = path.isAbsolute(configPath!) ? configPath! : path.join(process.cwd(), configPath!);
  const configContent = fs.readFileSync(fullPath, 'utf-8');
  const config = JSON.parse(configContent);

  // Validate required fields
  if (!config.name) {
    throw new Error('Config must have a "name" field');
  }
  if (!config.model?.provider || !config.model?.modelId) {
    throw new Error('Config must have model.provider and model.modelId');
  }

  return config;
}

function computeFingerprintHash(params: {
  model: { provider: string; modelId: string };
  systemPromptHash?: string;
}): string {
  const canonical = JSON.stringify({
    model: {
      provider: params.model.provider.toLowerCase(),
      modelId: params.model.modelId,
    },
    systemPromptHash: params.systemPromptHash,
  });
  return '0x' + createHash('sha256').update(canonical).digest('hex');
}

async function signWithPrivateKey(
  identityHash: string,
  config: AgentConfig,
  systemPromptHash: string | undefined,
  timestamp: string,
  privateKey: string
): Promise<SignatureResult> {
  const spinner = ora('Signing fingerprint...').start();

  try {
    const { Wallet } = await import('ethers');
    const wallet = new Wallet(privateKey);

    const message = FINGERPRINT_MESSAGE
      .replace('{agentName}', config.name)
      .replace('{provider}', config.model.provider)
      .replace('{modelId}', config.model.modelId)
      .replace('{systemPromptHash}', systemPromptHash || 'none')
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
  config: AgentConfig,
  systemPromptHash: string | undefined,
  timestamp: string,
  apiUrl: string
): Promise<SignatureResult> {
  const { browserSign } = await import('../utils/browser-sign.js');

  const message = FINGERPRINT_MESSAGE
    .replace('{agentName}', config.name)
    .replace('{provider}', config.model.provider)
    .replace('{modelId}', config.model.modelId)
    .replace('{systemPromptHash}', systemPromptHash || 'none')
    .replace('{identityHash}', identityHash)
    .replace('{timestamp}', timestamp);

  try {
    const result = await browserSign(identityHash, 'config', message);
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

async function registerFingerprint(
  apiUrl: string,
  config: AgentConfig,
  data: {
    identityHash: string;
    systemPromptHash?: string;
    storeConfig: boolean;
    signature: string;
    walletAddress: string;
    timestamp: string;
  }
): Promise<void> {
  const body: Record<string, unknown> = {
    agentName: config.name,
    model: config.model,
    storeConfig: data.storeConfig,
    signature: {
      type: 'human_wallet',
      value: data.signature,
      timestamp: data.timestamp,
    },
    walletAddress: data.walletAddress,
  };

  if (config.systemPrompt) {
    body.systemPrompt = config.systemPrompt;
  }

  if (data.storeConfig && config.parameters) {
    body.config = {
      parameters: config.parameters,
      tools: config.tools,
    };
  }

  const response = await fetch(`${apiUrl}/api/v2/agents/fingerprint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Registration failed' }));
    throw new Error(error.message || error.error?.message || 'Fingerprint registration failed');
  }
}
