/**
 * anchor command
 *
 * Anchors a hash on-chain. Hash is REQUIRED.
 * The cartório only registers identifiers presented explicitly.
 *
 * CARTÓRIO, NÃO INCUBADORA.
 */

import chalk from 'chalk';
import ora from 'ora';

const DEFAULT_CONTRACT = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';
const DEFAULT_RPC = 'https://mainnet.base.org';
const API_URL = 'https://agent007-api-production.up.railway.app';

interface AnchorOptions {
  rpc?: string;
  contract?: string;
  privateKey?: string;
  api?: string;
  local?: boolean;
}

export async function anchor(identityHash: string, options: AnchorOptions = {}): Promise<void> {
  // Validate hash
  if (!identityHash) {
    console.log();
    console.log(chalk.red('error: identity hash required'));
    console.log();
    console.log(chalk.dim('usage: agentid anchor <hash>'));
    console.log();
    console.log(chalk.dim('get your hash first:'));
    console.log(chalk.cyan('  agentid fingerprint'));
    console.log();
    process.exit(1);
  }

  // Normalize hash
  const hash = identityHash.startsWith('0x') ? identityHash : `0x${identityHash}`;

  // Validate format
  if (hash.length !== 66) {
    console.log();
    console.log(chalk.red('error: invalid hash format'));
    console.log(chalk.dim('expected: 0x + 64 hex characters'));
    console.log();
    process.exit(1);
  }

  console.log();
  console.log(chalk.dim('hash: ') + chalk.bold.green(hash));
  console.log();

  // Check for private key (local anchoring)
  const privateKey = options.privateKey || process.env.AGENTID_PRIVATE_KEY;

  if (options.local || privateKey) {
    await anchorLocal(hash, privateKey!, options);
  } else {
    await anchorViaAPI(hash, options);
  }
}

/**
 * Anchor via API (free, AgentID pays gas)
 */
async function anchorViaAPI(hash: string, options: AnchorOptions): Promise<void> {
  const apiUrl = options.api || API_URL;
  const spinner = ora('Anchoring on-chain...').start();

  try {
    const response = await fetch(`${apiUrl}/api/v1/blockchain/anchor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ identityHash: hash.replace('0x', '') }),
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      if (data.error?.code === 'ALREADY_ANCHORED' || data.error?.message?.includes('already')) {
        spinner.warn('Already registered');
        console.log();
        console.log(chalk.dim('verify: ') + chalk.cyan(`https://id-agent.org/verify/${hash}`));
        console.log();
        return;
      }
      throw new Error(data.error?.message || 'Anchor failed');
    }

    spinner.succeed('REGISTERED');
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
    console.log(chalk.dim('try with your own wallet:'));
    console.log(chalk.dim('  export AGENTID_PRIVATE_KEY="key"'));
    console.log(chalk.cyan(`  agentid anchor ${hash} --local`));
    console.log();
    process.exit(1);
  }
}

/**
 * Anchor with local wallet (user pays gas)
 */
async function anchorLocal(hash: string, privateKey: string, options: AnchorOptions): Promise<void> {
  if (!privateKey) {
    console.log(chalk.red('error: AGENTID_PRIVATE_KEY required'));
    console.log();
    console.log(chalk.dim('  export AGENTID_PRIVATE_KEY="key"'));
    console.log(chalk.cyan(`  agentid anchor ${hash} --local`));
    console.log();
    process.exit(1);
  }

  const spinner = ora('Connecting to Base...').start();

  try {
    const { Wallet, JsonRpcProvider, Contract } = await import('ethers');

    const rpcUrl = options.rpc || DEFAULT_RPC;
    const contractAddress = options.contract || DEFAULT_CONTRACT;

    const provider = new JsonRpcProvider(rpcUrl);
    const wallet = new Wallet(privateKey, provider);

    spinner.text = 'Checking balance...';
    const balance = await provider.getBalance(wallet.address);

    if (balance < BigInt(1e14)) {
      spinner.fail('Insufficient ETH');
      console.log(chalk.dim('wallet:  ') + chalk.white(wallet.address));
      console.log(chalk.dim('balance: ') + chalk.red((Number(balance) / 1e18).toFixed(6) + ' ETH'));
      console.log();
      console.log(chalk.dim('need ~0.0001 ETH on Base'));
      console.log();
      process.exit(1);
    }

    spinner.text = 'Checking on-chain...';

    const abi = [
      'function anchorIdentity(bytes32 identityHash) external',
      'function verifyIdentity(bytes32 identityHash) external view returns (bool)',
    ];

    const contract = new Contract(contractAddress, abi, wallet);

    const isValid = await contract.verifyIdentity(hash);
    if (isValid) {
      spinner.warn('Already registered');
      console.log();
      console.log(chalk.dim('verify: ') + chalk.cyan(`https://id-agent.org/verify/${hash}`));
      console.log();
      return;
    }

    spinner.text = 'Sending tx...';
    const tx = await contract.anchorIdentity(hash);

    spinner.text = 'Waiting for confirmation...';
    const receipt = await tx.wait();

    spinner.succeed('REGISTERED');
    console.log();
    console.log(chalk.dim('tx:    ') + chalk.cyan(receipt.hash));
    console.log(chalk.dim('block: ') + chalk.white(receipt.blockNumber));
    console.log();
    console.log(chalk.dim('verify: ') + chalk.cyan(`https://id-agent.org/verify/${hash}`));
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
