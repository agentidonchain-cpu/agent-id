/**
 * anchor command
 *
 * Anchors fingerprint on-chain. No hash argument needed.
 * Recalculates fingerprint automatically from environment.
 *
 * CARTÓRIO, NÃO INCUBADORA.
 */

import chalk from 'chalk';
import ora from 'ora';
import { detectFingerprint, getCachedFingerprint } from './fingerprint.js';

const DEFAULT_CONTRACT = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';
const DEFAULT_RPC = 'https://mainnet.base.org';
const API_URL = 'https://agent007-api-production.up.railway.app';

interface AnchorOptions {
  rpc?: string;
  contract?: string;
  privateKey?: string;
  api?: string;
  local?: boolean; // Use local wallet instead of API
}

export async function anchor(options: AnchorOptions = {}): Promise<void> {
  // Get fingerprint - recalculate from environment
  const cached = await getCachedFingerprint();
  const fp = cached || await detectFingerprint();

  console.log();
  console.log(chalk.dim('fingerprint: ') + chalk.bold.green(fp.fingerprint));
  console.log(chalk.dim('origin:      ') + chalk.white(fp.origin));
  console.log();

  // Check for private key (local anchoring)
  const privateKey = options.privateKey || process.env.AGENTID_PRIVATE_KEY;

  if (options.local || privateKey) {
    // Local anchoring with user's wallet
    await anchorLocal(fp.fingerprint, privateKey!, options);
  } else {
    // API anchoring (free, AgentID pays gas)
    await anchorViaAPI(fp.fingerprint, options);
  }
}

/**
 * Anchor via API (free, AgentID pays gas)
 */
async function anchorViaAPI(hash: string, options: AnchorOptions): Promise<void> {
  const apiUrl = options.api || API_URL;
  const spinner = ora('Anchoring on-chain (free)...').start();

  try {
    const response = await fetch(`${apiUrl}/api/v1/blockchain/anchor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityHash: hash.replace('0x', '') }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      // Check if already anchored
      if (data.error?.code === 'ALREADY_ANCHORED' || data.error?.message?.includes('already')) {
        spinner.warn('Already registered on-chain');
        console.log();
        console.log(chalk.dim('verify: ') + chalk.cyan(`https://id-agent.org/verify/${hash}`));
        console.log();
        return;
      }
      throw new Error(data.error?.message || 'Anchor failed');
    }

    spinner.succeed('REGISTERED ON-CHAIN');
    console.log();
    console.log(chalk.dim('tx:    ') + chalk.cyan(data.data.transactionHash));
    console.log(chalk.dim('block: ') + chalk.white(data.data.blockNumber));
    console.log();
    console.log(chalk.dim('verify: ') + chalk.cyan(`https://id-agent.org/verify/${hash}`));
    console.log();

  } catch (error: any) {
    spinner.fail('Anchor failed');
    console.log();
    console.log(chalk.red(error.message));
    console.log();

    // Suggest local anchoring if API fails
    console.log(chalk.dim('Try local anchoring with your own wallet:'));
    console.log(chalk.dim('  export AGENTID_PRIVATE_KEY="your-key"'));
    console.log(chalk.dim('  agentid anchor --local'));
    console.log();
    process.exit(1);
  }
}

/**
 * Anchor with local wallet (user pays gas)
 */
async function anchorLocal(hash: string, privateKey: string, options: AnchorOptions): Promise<void> {
  if (!privateKey) {
    console.log(chalk.red('error: AGENTID_PRIVATE_KEY required for local anchoring'));
    console.log();
    console.log(chalk.dim('  export AGENTID_PRIVATE_KEY="your-private-key"'));
    console.log(chalk.dim('  agentid anchor --local'));
    console.log();
    process.exit(1);
  }

  const spinner = ora('Connecting to Base Mainnet...').start();

  try {
    const { Wallet, JsonRpcProvider, Contract } = await import('ethers');

    const rpcUrl = options.rpc || DEFAULT_RPC;
    const contractAddress = options.contract || DEFAULT_CONTRACT;

    const provider = new JsonRpcProvider(rpcUrl);
    const wallet = new Wallet(privateKey, provider);

    spinner.text = 'Checking balance...';
    const balance = await provider.getBalance(wallet.address);

    if (balance < BigInt(1e14)) {
      spinner.fail('Insufficient ETH for gas');
      console.log(chalk.dim('wallet: ') + chalk.white(wallet.address));
      console.log(chalk.dim('balance: ') + chalk.red((Number(balance) / 1e18).toFixed(6) + ' ETH'));
      console.log();
      console.log(chalk.dim('Need ~0.0001 ETH on Base. Bridge at https://bridge.base.org'));
      console.log();
      process.exit(1);
    }

    spinner.text = 'Checking if already anchored...';

    const abi = [
      'function anchorIdentity(bytes32 identityHash) external',
      'function verifyIdentity(bytes32 identityHash) external view returns (bool)',
    ];

    const contract = new Contract(contractAddress, abi, wallet);
    const normalizedHash = hash.startsWith('0x') ? hash : `0x${hash}`;

    const isValid = await contract.verifyIdentity(normalizedHash);
    if (isValid) {
      spinner.warn('Already registered on-chain');
      console.log();
      console.log(chalk.dim('verify: ') + chalk.cyan(`https://id-agent.org/verify/${normalizedHash}`));
      console.log();
      return;
    }

    spinner.text = 'Sending transaction...';
    const tx = await contract.anchorIdentity(normalizedHash);

    spinner.text = 'Waiting for confirmation...';
    const receipt = await tx.wait();

    spinner.succeed('REGISTERED ON-CHAIN');
    console.log();
    console.log(chalk.dim('tx:    ') + chalk.cyan(receipt.hash));
    console.log(chalk.dim('block: ') + chalk.white(receipt.blockNumber));
    console.log();
    console.log(chalk.dim('verify: ') + chalk.cyan(`https://id-agent.org/verify/${normalizedHash}`));
    console.log();

  } catch (error: any) {
    spinner.fail('Anchor failed');
    console.log();
    console.log(chalk.red(error.message));
    console.log();
    process.exit(1);
  }
}

export default anchor;
