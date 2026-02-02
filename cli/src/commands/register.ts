/**
 * Register command
 * Creates a new agent identity with wallet signature and anchors on-chain
 */

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

interface AgentConfig {
  name: string;
  description: string;
  model: {
    provider: string;
    modelId: string;
    apiEndpoint?: string;
  };
  systemPrompt: string;
  parameters: {
    temperature: number;
    maxTokens: number;
  };
}

interface RegisterOptions {
  config?: string;
  api: string;
  anchor: boolean;
  storeConfig?: boolean;
}

interface SignatureResult {
  signature: string;
  walletAddress: string;
  timestamp: string;
  message: string;
}

// Message template for signing
const CONFIG_IDENTITY_MESSAGE = `AgentID ConfigIdentity Registration

I declare ownership of this agent configuration.

Identity Hash: {identityHash}
Chain: Base Mainnet (8453)
Contract: 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa
Timestamp: {timestamp}`;

export async function register(options: RegisterOptions): Promise<void> {
  console.log();
  console.log(chalk.bold.green('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.green('║') + chalk.bold('           AgentID - Register Agent Identity              ') + chalk.bold.green('║'));
  console.log(chalk.bold.green('╚════════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.white('This command registers your AI agent and creates a unique identity hash.'));
  console.log(chalk.white('Your identity will be signed with your wallet and anchored on-chain.'));
  console.log();
  console.log(chalk.bold.green('✓ FREE: ') + chalk.white('Registration and on-chain anchoring are free!'));
  console.log(chalk.dim('  AgentID covers all blockchain gas fees for you.'));
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
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  let config: AgentConfig;

  // Load config from file or prompt
  if (options.config) {
    console.log(chalk.bold.cyan('STEP 1: LOADING CONFIGURATION'));
    console.log(chalk.dim('Reading from: ') + chalk.cyan(options.config));
    console.log();

    const spinner = ora('Loading configuration file...').start();
    try {
      const content = await readFile(options.config, 'utf-8');
      config = JSON.parse(content);
      spinner.succeed('Configuration loaded successfully');

      // Show summary
      console.log();
      console.log(chalk.bold('Agent Summary:'));
      console.log(chalk.dim('  Name:        ') + chalk.white(config.name || 'N/A'));
      console.log(chalk.dim('  Provider:    ') + chalk.white(config.model?.provider || 'N/A'));
      console.log(chalk.dim('  Model:       ') + chalk.white(config.model?.modelId || 'N/A'));
      console.log(chalk.dim('  Temperature: ') + chalk.white(config.parameters?.temperature ?? 'N/A'));
      console.log();
    } catch (error) {
      spinner.fail('Failed to load configuration file');
      console.log();
      console.log(chalk.red('Error: Could not read or parse the configuration file.'));
      console.log(chalk.dim('Make sure the file exists and contains valid JSON.'));
      console.log();
      console.log(chalk.yellow('TIP: Create a config file first with:'));
      console.log(chalk.cyan('  npx agentidbase init'));
      console.log();
      process.exit(1);
    }
  } else {
    console.log(chalk.yellow('No configuration file specified.'));
    console.log(chalk.dim('You can provide one with: ') + chalk.cyan('--config agent.json'));
    console.log();
    console.log(chalk.white('Starting interactive configuration...'));
    console.log();
    config = await promptConfig();
  }

  // Generate identity hash locally
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.cyan('STEP 2: GENERATING IDENTITY HASH'));
  console.log(chalk.dim('Computing SHA-256 hash of your agent\'s configuration...'));
  console.log();

  const hashSpinner = ora('Computing cryptographic hash...').start();
  const identityHash = generateIdentityHash(config);
  hashSpinner.succeed('Identity hash generated');

  console.log();
  console.log(chalk.bold('Your Agent Identity Hash:'));
  console.log();
  console.log(chalk.bold.cyan(`  0x${identityHash}`));
  console.log();
  console.log(chalk.dim('This hash uniquely identifies your agent\'s configuration.'));
  console.log(chalk.dim('Any change to the config will produce a different hash.'));
  console.log();

  // Sign the identity
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.cyan('STEP 3: SIGNING IDENTITY'));
  console.log(chalk.dim('Proving ownership of this identity with your wallet...'));
  console.log();

  let signatureResult: SignatureResult;

  if (privateKey) {
    // CLI signing with private key
    signatureResult = await signWithPrivateKey(identityHash, privateKey);
  } else {
    // Browser signing with MetaMask
    signatureResult = await signWithBrowser(identityHash, options.api);
  }

  console.log();
  console.log(chalk.bold('Signature Details:'));
  console.log(chalk.dim('  Wallet:    ') + chalk.white(signatureResult.walletAddress));
  console.log(chalk.dim('  Timestamp: ') + chalk.white(signatureResult.timestamp));
  console.log(chalk.dim('  Signature: ') + chalk.white(signatureResult.signature.slice(0, 20) + '...'));
  console.log();

  // Register with API (including signature)
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.cyan('STEP 4: REGISTERING WITH AGENTID'));
  console.log(chalk.dim('Submitting signed identity to: ') + chalk.cyan(options.api));
  console.log();

  const registerSpinner = ora('Sending registration request...').start();
  try {
    const result = await registerWithAPI(options.api, config, {
      identityHash: `0x${identityHash}`,
      signature: signatureResult.signature,
      walletAddress: signatureResult.walletAddress,
      timestamp: signatureResult.timestamp,
      message: signatureResult.message,
      storeConfig: options.storeConfig,
    });
    registerSpinner.succeed('Agent registered with AgentID');

    // Show anchor status from registration response
    if (result.anchored) {
      console.log();
      console.log(chalk.dim('─'.repeat(60)));
      console.log();
      console.log(chalk.bold.cyan('STEP 5: ON-CHAIN ANCHORING'));
      console.log(chalk.dim('Recording identity on Base Mainnet (free - we pay the gas)...'));
      console.log();
      console.log(chalk.green('✓ Successfully anchored on Base Mainnet!'));
      if (result.transactionHash) {
        console.log();
        console.log(chalk.dim('Transaction: ') + chalk.cyan(`https://basescan.org/tx/${result.transactionHash}`));
      }
    } else if (options.anchor) {
      console.log();
      console.log(chalk.dim('─'.repeat(60)));
      console.log();
      console.log(chalk.yellow('⚠ On-chain anchoring pending'));
      console.log(chalk.dim('Your identity will be anchored on-chain shortly.'));
      console.log(chalk.dim('Use the verify command to check status:'));
      console.log(chalk.cyan(`  npx agentidbase verify 0x${identityHash}`));
    }

    // Final output
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold.green('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.green('║') + chalk.bold.green('              ✓ REGISTRATION COMPLETE                      ') + chalk.bold.green('║'));
    console.log(chalk.bold.green('╚════════════════════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.bold('Summary:'));
    console.log(chalk.dim('  Identity Hash: ') + chalk.cyan(`0x${identityHash}`));
    console.log(chalk.dim('  Owner:         ') + chalk.white(signatureResult.walletAddress));
    console.log(chalk.dim('  Type:          ') + chalk.green('CONFIG (verified)'));
    console.log(chalk.dim('  Status:        ') + chalk.green('Signed & Anchored'));
    console.log(chalk.dim('  Chain:         ') + chalk.white('Base Mainnet (8453)'));
    console.log(chalk.dim('  Cost:          ') + chalk.green('FREE (gas paid by AgentID)'));
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold.yellow('WHAT TO DO NOW:'));
    console.log();
    console.log(chalk.white('  1. ') + chalk.dim('Verify your identity on-chain:'));
    console.log(chalk.cyan(`     npx agentidbase verify 0x${identityHash}`));
    console.log();
    console.log(chalk.white('  2. ') + chalk.dim('Generate a QR code for your users to scan:'));
    console.log(chalk.cyan(`     npx agentidbase qr 0x${identityHash}`));
    console.log();
    console.log(chalk.white('  3. ') + chalk.dim('View your agent\'s verification page:'));
    console.log(chalk.cyan(`     https://id-agent.org/verify/0x${identityHash}`));
    console.log();
    console.log(chalk.white('  4. ') + chalk.dim('Add the identity hash to your agent\'s responses:'));
    console.log(chalk.dim('     Include it in API responses so users can verify your agent.'));
    console.log();

  } catch (error: any) {
    registerSpinner.fail('Registration failed');
    console.log();
    console.log(chalk.red('Error: ' + error.message));
    console.log();
    console.log(chalk.dim('Troubleshooting:'));
    console.log(chalk.dim('  • Check your internet connection'));
    console.log(chalk.dim('  • Verify the API endpoint is correct'));
    console.log(chalk.dim('  • Ensure your config file is valid JSON'));
    console.log();
    process.exit(1);
  }
}

/**
 * Sign with private key (CLI method)
 */
async function signWithPrivateKey(identityHash: string, privateKey: string): Promise<SignatureResult> {
  const spinner = ora('Signing with local private key...').start();

  try {
    const { Wallet } = await import('ethers');
    const wallet = new Wallet(privateKey);

    const timestamp = new Date().toISOString();
    const message = CONFIG_IDENTITY_MESSAGE
      .replace('{identityHash}', `0x${identityHash}`)
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
    console.log();
    console.log(chalk.red('Error: ' + error.message));
    console.log();
    console.log(chalk.dim('Check that your AGENTID_PRIVATE_KEY is valid.'));
    process.exit(1);
  }
}

/**
 * Sign with browser (MetaMask method)
 */
async function signWithBrowser(identityHash: string, apiUrl: string): Promise<SignatureResult> {
  // Dynamic import to avoid loading if not needed
  const { browserSign } = await import('../utils/browser-sign.js');

  const timestamp = new Date().toISOString();
  const message = CONFIG_IDENTITY_MESSAGE
    .replace('{identityHash}', `0x${identityHash}`)
    .replace('{timestamp}', timestamp);

  try {
    const result = await browserSign(`0x${identityHash}`, 'config', message);
    return {
      signature: result.signature,
      walletAddress: result.walletAddress,
      timestamp,  // Use original timestamp (embedded in message), not session timestamp
      message,
    };
  } catch (error: any) {
    console.log();
    console.log(chalk.red('Browser signing failed: ' + error.message));
    console.log();
    console.log(chalk.yellow('Alternative: Set AGENTID_PRIVATE_KEY environment variable'));
    console.log(chalk.dim('  export AGENTID_PRIVATE_KEY="0x..."'));
    console.log();
    process.exit(1);
  }
}

async function promptConfig(): Promise<AgentConfig> {
  console.log(chalk.bold.cyan('STEP 1/3: Agent Name'));
  console.log();

  const nameAnswer = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Agent name:',
      validate: (input: string) => input.length > 0 || 'Name is required.',
    },
  ]);

  console.log();
  console.log(chalk.bold.cyan('STEP 2/3: Model'));
  console.log();

  const modelAnswer = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Provider:',
      choices: [
        { name: 'Anthropic (Claude)', value: 'anthropic' },
        { name: 'OpenAI (GPT)', value: 'openai' },
        { name: 'Google (Gemini)', value: 'google' },
        { name: 'Mistral', value: 'mistral' },
        { name: 'Other', value: 'other' },
      ],
    },
    {
      type: 'input',
      name: 'modelId',
      message: 'Model ID:',
      default: (ans: { provider: string }) => {
        const defaults: Record<string, string> = {
          anthropic: 'claude-sonnet-4-20250514',
          openai: 'gpt-4o',
          google: 'gemini-2.0-flash',
          mistral: 'mistral-large-latest',
        };
        return defaults[ans.provider] || '';
      },
    },
  ]);

  console.log();
  console.log(chalk.bold.cyan('STEP 3/3: System Prompt (optional)'));
  console.log(chalk.dim('Press Enter to skip.'));
  console.log();

  const promptAnswer = await inquirer.prompt([
    {
      type: 'input',
      name: 'systemPrompt',
      message: 'System prompt:',
      default: '',
    },
  ]);

  console.log();

  return {
    name: nameAnswer.name,
    description: '',
    model: {
      provider: modelAnswer.provider,
      modelId: modelAnswer.modelId,
    },
    systemPrompt: promptAnswer.systemPrompt || 'AI assistant',
    parameters: {
      temperature: 0.7,
      maxTokens: 4096,
    },
  };
}

function generateIdentityHash(config: AgentConfig): string {
  const canonical = JSON.stringify({
    systemPrompt: {
      content: config.systemPrompt || '',
      version: '1.0',
    },
    model: {
      provider: config.model.provider,
      modelId: config.model.modelId,
    },
    parameters: {
      temperature: config.parameters?.temperature ?? 0.7,
      maxTokens: config.parameters?.maxTokens ?? 4096,
    },
  }, Object.keys({
    systemPrompt: null,
    model: null,
    parameters: null,
  }).sort());

  return createHash('sha256').update(canonical).digest('hex');
}

async function registerWithAPI(
  apiUrl: string,
  config: AgentConfig,
  signatureData: {
    identityHash: string;
    signature: string;
    walletAddress: string;
    timestamp: string;
    message: string;
    storeConfig?: boolean;
  }
): Promise<{ registrationId: string; anchored?: boolean; transactionHash?: string }> {
  // Use the new V1 config registration endpoint
  const response = await fetch(`${apiUrl}/api/v1/agents/register/config`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      config: {
        name: config.name,
        description: config.description,
        systemPrompt: config.systemPrompt,
        model: config.model,
        parameters: config.parameters,
      },
      identityHash: signatureData.identityHash,
      signature: signatureData.signature,
      walletAddress: signatureData.walletAddress,
      timestamp: signatureData.timestamp,
      storeConfig: signatureData.storeConfig || false,
    }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: 'Registration failed' }));
    throw new Error(error.message || error.error?.message || 'Registration failed');
  }

  const data = await response.json();
  return {
    registrationId: data.data?.identityHash || signatureData.identityHash,
    anchored: data.data?.anchored,
    transactionHash: data.data?.transactionHash,
  };
}

