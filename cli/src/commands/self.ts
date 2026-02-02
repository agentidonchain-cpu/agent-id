/**
 * Self command
 * Allows an autonomous agent to self-register with its own Ed25519 keypair
 * No human wallet or Twitter required
 */

import { createHash, randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import nacl from 'tweetnacl';

interface SelfOptions {
  api: string;
  name?: string;
  keypair?: string;
  endpoint?: string;
  pow?: boolean;
}

interface KeypairData {
  publicKey: string;
  secretKey: string;
}

// Self-registration message template
const SELF_REGISTER_MESSAGE = `AgentID Self-Registration

Agent: {agentName}
Public Key: {publicKey}
Timestamp: {timestamp}`;

export async function self(options: SelfOptions): Promise<void> {
  console.log();
  console.log(chalk.bold.magenta('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.magenta('║') + chalk.bold('           AgentID - Agent Self-Registration              ') + chalk.bold.magenta('║'));
  console.log(chalk.bold.magenta('╚════════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.white('Register an autonomous agent with its own Ed25519 keypair.'));
  console.log(chalk.dim('No human wallet or Twitter verification required.'));
  console.log();
  console.log(chalk.bold.magenta('BEST FOR:'));
  console.log(chalk.dim('  • Truly autonomous agents'));
  console.log(chalk.dim('  • Agent-to-agent trust networks'));
  console.log(chalk.dim('  • Agents that manage their own identity'));
  console.log();
  console.log(chalk.bold.yellow('⚠ WHAT THIS PROVES:'));
  console.log(chalk.dim('  ✓ An agent with this keypair exists'));
  console.log(chalk.dim('  ✓ The agent can sign messages'));
  console.log(chalk.dim('  ✗ Does NOT prove who controls the agent'));
  console.log(chalk.dim('  ✗ Does NOT prove agent capabilities'));
  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  // Step 1: Get or generate keypair
  console.log(chalk.bold.magenta('STEP 1: KEYPAIR'));
  console.log();

  const keypair = await getOrGenerateKeypair(options);
  console.log(chalk.bold('Keypair ready:'));
  console.log(chalk.dim('  Public Key: ') + chalk.white(keypair.publicKey.slice(0, 20) + '...'));
  console.log();

  // Step 2: Get agent name
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.magenta('STEP 2: AGENT DETAILS'));
  console.log();

  let agentName = options.name;
  if (!agentName) {
    const nameAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'name',
        message: 'Agent name:',
        validate: (input: string) => input.length > 0 || 'Name is required',
      },
    ]);
    agentName = nameAnswer.name;
  }
  console.log(chalk.dim('Name: ') + chalk.white(agentName));
  console.log();

  // Optional: capabilities
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

  // Optional: endpoint
  let endpoint = options.endpoint;
  if (!endpoint) {
    const endpointAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'endpoint',
        message: 'Agent endpoint URL (optional):',
        default: '',
      },
    ]);
    endpoint = endpointAnswer.endpoint || undefined;
  }

  if (endpoint) {
    console.log(chalk.dim('Endpoint: ') + chalk.white(endpoint));
  }
  console.log();

  // Step 3: Proof of Work (anti-spam)
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.magenta('STEP 3: PROOF OF WORK (anti-spam)'));
  console.log();

  let proofOfWork: { nonce: string; difficulty: number } | undefined;

  if (options.pow !== false) {
    const powAnswer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'doPow',
        message: 'Generate proof of work? (increases trust score)',
        default: true,
      },
    ]);

    if (powAnswer.doPow) {
      const powSpinner = ora('Computing proof of work...').start();
      const difficulty = 4;
      const powData = keypair.publicKey + agentName;

      let nonce = '';
      let attempts = 0;
      const target = '0'.repeat(difficulty);

      while (true) {
        attempts++;
        nonce = randomBytes(8).toString('hex');
        const hash = createHash('sha256').update(powData + nonce).digest('hex');

        if (hash.startsWith(target)) {
          break;
        }

        if (attempts % 10000 === 0) {
          powSpinner.text = `Computing proof of work... (${attempts.toLocaleString()} attempts)`;
        }
      }

      proofOfWork = { nonce, difficulty };
      powSpinner.succeed(`Proof of work found after ${attempts.toLocaleString()} attempts`);
      console.log(chalk.dim('  Nonce: ') + chalk.white(nonce));
      console.log(chalk.dim('  Difficulty: ') + chalk.white(difficulty.toString()));
    } else {
      console.log(chalk.dim('Skipping proof of work (lower trust score)'));
    }
  }
  console.log();

  // Step 4: Sign and register
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.magenta('STEP 4: SIGN AND REGISTER'));
  console.log();

  const timestamp = new Date().toISOString();
  const signSpinner = ora('Signing self-registration...').start();

  // Create message
  const message = SELF_REGISTER_MESSAGE
    .replace('{agentName}', agentName!)
    .replace('{publicKey}', keypair.publicKey)
    .replace('{timestamp}', timestamp);

  // Sign with Ed25519
  const messageBytes = new TextEncoder().encode(message);
  const secretKeyBytes = Buffer.from(keypair.secretKey, 'base64');
  const signatureBytes = nacl.sign.detached(messageBytes, secretKeyBytes);
  const signature = Buffer.from(signatureBytes).toString('base64');

  signSpinner.succeed('Message signed');

  // Generate identity hash
  const identityHash = '0x' + createHash('sha256').update(keypair.publicKey).digest('hex');

  console.log();
  console.log(chalk.bold('Identity Hash:'));
  console.log(chalk.bold.magenta(`  ${identityHash}`));
  console.log();

  // Register with API
  const registerSpinner = ora('Submitting self-registration...').start();

  try {
    const response = await fetch(`${options.api}/api/v2/agents/self-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentName,
        publicKey: keypair.publicKey,
        declaredCapabilities,
        signature,
        endpoint,
        proofOfWork,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Registration failed' }));
      throw new Error(error.message || error.error?.message || 'Self-registration failed');
    }

    const data = await response.json();
    registerSpinner.succeed('Self-registration complete!');

    // Final output
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold.magenta('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.magenta('║') + chalk.bold.magenta('          ✓ SELF-REGISTRATION COMPLETE                     ') + chalk.bold.magenta('║'));
    console.log(chalk.bold.magenta('╚════════════════════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.bold('Summary:'));
    console.log(chalk.dim('  Agent:         ') + chalk.white(agentName));
    console.log(chalk.dim('  Identity Hash: ') + chalk.magenta(identityHash));
    console.log(chalk.dim('  Public Key:    ') + chalk.white(keypair.publicKey.slice(0, 30) + '...'));
    console.log(chalk.dim('  Type:          ') + chalk.magenta('SELF-CLAIM (autonomous)'));
    console.log(chalk.dim('  Trust Score:   ') + chalk.white(data.data?.trustScore || 'N/A'));
    console.log(chalk.dim('  Proof of Work: ') + chalk.white(proofOfWork ? 'Yes' : 'No'));
    console.log(chalk.dim('  Cost:          ') + chalk.green('FREE'));
    console.log();
    console.log(chalk.bold.red('⚠ IMPORTANT:'));
    console.log(chalk.dim('  Keep your secret key safe! It\'s required for future operations.'));
    console.log(chalk.dim('  The keypair file is: ') + chalk.cyan('agentid-keypair.json'));
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold.white('WHAT TO DO NOW:'));
    console.log();
    console.log(chalk.white('  1. ') + chalk.dim('View your registration:'));
    console.log(chalk.cyan(`     https://id-agent.org/verify/${identityHash}`));
    console.log();
    console.log(chalk.white('  2. ') + chalk.dim('Use this identity in agent-to-agent communication'));
    console.log();
    console.log(chalk.white('  3. ') + chalk.dim('Optional: Link a Twitter account for more trust'));
    console.log(chalk.cyan('     npx agentidbase verify-twitter --identity-hash ' + identityHash.slice(0, 20) + '...'));
    console.log();

  } catch (error: any) {
    registerSpinner.fail('Registration failed');
    console.log();
    console.log(chalk.red('Error: ' + error.message));
    process.exit(1);
  }
}

async function getOrGenerateKeypair(options: SelfOptions): Promise<KeypairData> {
  // Check for existing keypair file
  const defaultKeypairPath = path.join(process.cwd(), 'agentid-keypair.json');

  if (options.keypair) {
    // Load from specified path
    const keypairPath = path.isAbsolute(options.keypair)
      ? options.keypair
      : path.join(process.cwd(), options.keypair);

    if (!fs.existsSync(keypairPath)) {
      throw new Error(`Keypair file not found: ${keypairPath}`);
    }

    const content = fs.readFileSync(keypairPath, 'utf-8');
    const keypair = JSON.parse(content);

    if (!keypair.publicKey || !keypair.secretKey) {
      throw new Error('Invalid keypair file format');
    }

    console.log(chalk.dim('Loaded keypair from: ') + chalk.cyan(keypairPath));
    return keypair;
  }

  if (fs.existsSync(defaultKeypairPath)) {
    // Ask if user wants to use existing keypair
    const useExisting = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'use',
        message: `Found existing keypair (${defaultKeypairPath}). Use it?`,
        default: true,
      },
    ]);

    if (useExisting.use) {
      const content = fs.readFileSync(defaultKeypairPath, 'utf-8');
      const keypair = JSON.parse(content);
      console.log(chalk.green('✓ Using existing keypair'));
      return keypair;
    }
  }

  // Generate new keypair
  console.log(chalk.dim('Generating new Ed25519 keypair...'));

  const keyPair = nacl.sign.keyPair();
  const keypair: KeypairData = {
    publicKey: Buffer.from(keyPair.publicKey).toString('base64'),
    secretKey: Buffer.from(keyPair.secretKey).toString('base64'),
  };

  // Save keypair
  fs.writeFileSync(defaultKeypairPath, JSON.stringify(keypair, null, 2) + '\n');
  console.log(chalk.green('✓ Keypair generated and saved to: ') + chalk.cyan(defaultKeypairPath));
  console.log(chalk.yellow('⚠ Keep this file secure! It contains your secret key.'));

  return keypair;
}
