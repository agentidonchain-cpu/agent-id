/**
 * Anchor command
 * Anchors an agent identity on-chain (Base Mainnet)
 */

import chalk from 'chalk';
import ora from 'ora';

const DEFAULT_CONTRACT = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';
const DEFAULT_RPC = 'https://mainnet.base.org';

interface AnchorOptions {
  rpc: string;
  contract?: string;
  privateKey?: string;
}

export async function anchor(identityHash: string, options: AnchorOptions): Promise<void> {
  console.log();
  console.log(chalk.bold('AgentID - Anchor Identity On-Chain'));
  console.log(chalk.dim('─'.repeat(40)));
  console.log();

  // Normalize hash
  const hash = identityHash.startsWith('0x') ? identityHash : `0x${identityHash}`;
  const contractAddress = options.contract || DEFAULT_CONTRACT;

  // Check for private key
  const privateKey = options.privateKey || process.env.AGENTID_PRIVATE_KEY;

  if (!privateKey) {
    console.log(chalk.red('ERROR: Private key required for anchoring'));
    console.log();
    console.log(chalk.dim('Provide via:'));
    console.log('  --private-key <key>');
    console.log('  AGENTID_PRIVATE_KEY environment variable');
    console.log();
    console.log(chalk.dim('Or use the API to anchor:'));
    console.log(chalk.cyan('  curl -X POST https://api.agentid.xyz/api/v1/blockchain/anchor/' + hash.slice(0, 10) + '...'));
    console.log();
    process.exit(1);
  }

  console.log(chalk.dim('Identity Hash:'));
  console.log(chalk.cyan(hash));
  console.log();
  console.log(chalk.dim('Contract:'));
  console.log(chalk.cyan(contractAddress));
  console.log();
  console.log(chalk.dim('Chain:'));
  console.log('Base Mainnet (8453)');
  console.log();

  const spinner = ora('Connecting to blockchain').start();

  try {
    // Dynamic import to avoid loading ethers if not needed
    const { Wallet, JsonRpcProvider, Contract } = await import('ethers');

    const provider = new JsonRpcProvider(options.rpc);
    const wallet = new Wallet(privateKey, provider);

    spinner.text = 'Checking wallet balance';
    const balance = await provider.getBalance(wallet.address);

    if (balance < BigInt(1e14)) {
      spinner.fail('Insufficient balance');
      console.log(chalk.red('Wallet needs ETH on Base for gas'));
      console.log(chalk.dim('Address: ' + wallet.address));
      process.exit(1);
    }

    spinner.text = 'Checking if already anchored';

    const abi = [
      'function anchorIdentity(bytes32 identityHash) external',
      'function verifyIdentity(bytes32 identityHash) external view returns (bool)',
      'function getIdentity(bytes32) external view returns (bool exists, address creator, uint256 anchoredAt, uint256 revokedAt, bool isValid)',
    ];

    const contract = new Contract(contractAddress, abi, wallet);

    // Check if already anchored
    const isValid = await contract.verifyIdentity(hash);
    if (isValid) {
      spinner.warn('Identity already anchored');
      const identity = await contract.getIdentity(hash);
      console.log();
      console.log(chalk.dim('Creator:  ') + identity[1]);
      console.log(chalk.dim('Anchored: ') + new Date(Number(identity[2]) * 1000).toISOString());
      console.log();
      console.log(chalk.dim('Verify: ') + chalk.cyan('https://basescan.org/address/' + contractAddress + '#readContract'));
      return;
    }

    spinner.text = 'Estimating gas';
    const gasEstimate = await contract.anchorIdentity.estimateGas(hash);
    const feeData = await provider.getFeeData();

    spinner.text = 'Sending transaction';
    const tx = await contract.anchorIdentity(hash, {
      gasLimit: gasEstimate * BigInt(120) / BigInt(100), // 20% buffer
    });

    spinner.text = 'Waiting for confirmation (' + tx.hash.slice(0, 10) + '...)';
    const receipt = await tx.wait();

    spinner.succeed('Identity anchored on-chain');

    console.log();
    console.log(chalk.bold.green('SUCCESS'));
    console.log();
    console.log(chalk.dim('Transaction: ') + chalk.cyan(receipt.hash));
    console.log(chalk.dim('Block:       ') + receipt.blockNumber);
    console.log(chalk.dim('Gas used:    ') + receipt.gasUsed.toString());
    console.log();
    console.log(chalk.dim('View on Basescan:'));
    console.log(chalk.cyan('https://basescan.org/tx/' + receipt.hash));
    console.log();
    console.log(chalk.dim('Verify identity:'));
    console.log(chalk.white('npx agentid verify ' + hash));
    console.log();

  } catch (error: any) {
    spinner.fail('Anchoring failed');
    console.log(chalk.red(error.message));

    if (error.message.includes('Already anchored')) {
      console.log(chalk.yellow('This identity is already on-chain.'));
    }

    process.exit(1);
  }
}
