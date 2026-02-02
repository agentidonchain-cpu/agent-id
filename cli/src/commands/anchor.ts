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
  console.log(chalk.bold.yellow('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.yellow('║') + chalk.bold('      AgentID - Manual Anchor (Advanced Users Only)       ') + chalk.bold.yellow('║'));
  console.log(chalk.bold.yellow('╚════════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.yellow('NOTE: You probably don\'t need this command!'));
  console.log();
  console.log(chalk.white('When you run ') + chalk.cyan('npx agentidbase register') + chalk.white(', your identity is'));
  console.log(chalk.white('automatically anchored on-chain ') + chalk.green('for FREE') + chalk.white(' - AgentID pays the gas.'));
  console.log();
  console.log(chalk.dim('This command is for advanced users who want to:'));
  console.log(chalk.dim('  • Anchor using their own wallet'));
  console.log(chalk.dim('  • Re-anchor an identity that was registered offline'));
  console.log(chalk.dim('  • Have direct control over the blockchain transaction'));
  console.log();
  console.log(chalk.yellow('Requires: ETH on Base for gas fees (~$0.001)'));
  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  // Normalize hash
  const hash = identityHash.startsWith('0x') ? identityHash : `0x${identityHash}`;
  const contractAddress = options.contract || DEFAULT_CONTRACT;

  // Check for private key
  const privateKey = options.privateKey || process.env.AGENTID_PRIVATE_KEY;

  if (!privateKey) {
    console.log(chalk.bold.red('ERROR: Private Key Required'));
    console.log();
    console.log(chalk.white('To anchor your identity on-chain, you need a wallet private key.'));
    console.log(chalk.white('The wallet must have ETH on Base Mainnet for gas fees.'));
    console.log();
    console.log(chalk.bold('Option 1: ') + chalk.dim('Pass the key directly (less secure):'));
    console.log(chalk.cyan('  npx agentidbase anchor ' + hash.slice(0, 18) + '... --private-key <YOUR_KEY>'));
    console.log();
    console.log(chalk.bold('Option 2: ') + chalk.dim('Set environment variable (recommended):'));
    console.log(chalk.cyan('  export AGENTID_PRIVATE_KEY="your-private-key"'));
    console.log(chalk.cyan('  npx agentidbase anchor ' + hash.slice(0, 18) + '...'));
    console.log();
    console.log(chalk.bold('Option 3: ') + chalk.dim('Use .env file:'));
    console.log(chalk.cyan('  echo "AGENTID_PRIVATE_KEY=your-key" >> .env'));
    console.log(chalk.cyan('  source .env && npx agentidbase anchor ' + hash.slice(0, 18) + '...'));
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.yellow('How to get ETH on Base:'));
    console.log(chalk.dim('  1. Bridge ETH from Ethereum using https://bridge.base.org'));
    console.log(chalk.dim('  2. Buy directly on Base via Coinbase'));
    console.log(chalk.dim('  3. Use a faucet for testnet (for testing only)'));
    console.log();
    process.exit(1);
  }

  console.log(chalk.bold.cyan('ANCHOR CONFIGURATION'));
  console.log();
  console.log(chalk.dim('  Identity Hash: ') + chalk.cyan(hash));
  console.log(chalk.dim('  Contract:      ') + chalk.cyan(contractAddress));
  console.log(chalk.dim('  Chain:         ') + chalk.white('Base Mainnet (Chain ID: 8453)'));
  console.log(chalk.dim('  RPC:           ') + chalk.white(options.rpc));
  console.log();

  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.cyan('CONNECTING TO BLOCKCHAIN'));
  console.log();

  const spinner = ora('Connecting to Base Mainnet...').start();

  try {
    // Dynamic import to avoid loading ethers if not needed
    const { Wallet, JsonRpcProvider, Contract } = await import('ethers');

    const provider = new JsonRpcProvider(options.rpc);
    const wallet = new Wallet(privateKey, provider);

    spinner.succeed('Connected to Base Mainnet');
    console.log(chalk.dim('  Wallet: ') + chalk.white(wallet.address));
    console.log();

    const balanceSpinner = ora('Checking wallet balance...').start();
    const balance = await provider.getBalance(wallet.address);
    const balanceEth = Number(balance) / 1e18;

    if (balance < BigInt(1e14)) {
      balanceSpinner.fail('Insufficient balance for gas fees');
      console.log();
      console.log(chalk.red('Your wallet needs ETH on Base to pay for gas.'));
      console.log(chalk.dim('  Current balance: ') + chalk.red(balanceEth.toFixed(6) + ' ETH'));
      console.log(chalk.dim('  Required:        ') + chalk.white('~0.0001 ETH'));
      console.log();
      console.log(chalk.yellow('How to add ETH to your wallet on Base:'));
      console.log(chalk.dim('  1. Bridge from Ethereum: ') + chalk.cyan('https://bridge.base.org'));
      console.log(chalk.dim('  2. Buy on Coinbase and withdraw to Base'));
      console.log();
      process.exit(1);
    }

    balanceSpinner.succeed('Wallet has sufficient balance');
    console.log(chalk.dim('  Balance: ') + chalk.green(balanceEth.toFixed(6) + ' ETH'));
    console.log();

    const checkSpinner = ora('Checking if identity is already anchored...').start();

    const abi = [
      'function anchorIdentity(bytes32 identityHash) external',
      'function verifyIdentity(bytes32 identityHash) external view returns (bool)',
      'function getIdentity(bytes32) external view returns (bool exists, address creator, uint256 anchoredAt, uint256 revokedAt, bool isValid)',
    ];

    const contract = new Contract(contractAddress, abi, wallet);

    // Check if already anchored
    const isValid = await contract.verifyIdentity(hash);
    if (isValid) {
      checkSpinner.warn('Identity is already anchored on-chain');
      const identity = await contract.getIdentity(hash);
      console.log();
      console.log(chalk.yellow('This identity was already anchored by:'));
      console.log(chalk.dim('  Creator:  ') + chalk.white(identity[1]));
      console.log(chalk.dim('  Anchored: ') + chalk.white(new Date(Number(identity[2]) * 1000).toISOString()));
      console.log();
      console.log(chalk.dim('View on Basescan:'));
      console.log(chalk.cyan('  https://basescan.org/address/' + contractAddress + '#readContract'));
      console.log();
      console.log(chalk.dim('Verify via CLI:'));
      console.log(chalk.cyan('  npx agentidbase verify ' + hash));
      console.log();
      return;
    }

    checkSpinner.succeed('Identity not yet anchored - proceeding');
    console.log();

    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold.cyan('SENDING TRANSACTION'));
    console.log();

    const gasSpinner = ora('Estimating gas costs...').start();
    const gasEstimate = await contract.anchorIdentity.estimateGas(hash);
    const feeData = await provider.getFeeData();
    gasSpinner.succeed('Gas estimated: ~' + gasEstimate.toString() + ' units');
    console.log();

    const txSpinner = ora('Sending transaction to Base Mainnet...').start();
    const tx = await contract.anchorIdentity(hash, {
      gasLimit: gasEstimate * BigInt(120) / BigInt(100), // 20% buffer
    });

    txSpinner.succeed('Transaction sent');
    console.log(chalk.dim('  TX Hash: ') + chalk.cyan(tx.hash));
    console.log();

    const confirmSpinner = ora('Waiting for blockchain confirmation (usually ~2 seconds)...').start();
    const receipt = await tx.wait();
    confirmSpinner.succeed('Transaction confirmed!');
    console.log(chalk.dim('  Block:    ') + chalk.white(receipt.blockNumber));
    console.log(chalk.dim('  Gas used: ') + chalk.white(receipt.gasUsed.toString()));

    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold.green('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.green('║') + chalk.bold.green('         ✓ IDENTITY ANCHORED SUCCESSFULLY                  ') + chalk.bold.green('║'));
    console.log(chalk.bold.green('╚════════════════════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.bold('Transaction Details:'));
    console.log(chalk.dim('  Hash:     ') + chalk.cyan(receipt.hash));
    console.log(chalk.dim('  Block:    ') + chalk.white(receipt.blockNumber));
    console.log(chalk.dim('  Gas used: ') + chalk.white(receipt.gasUsed.toString()));
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold.yellow('NEXT STEPS:'));
    console.log();
    console.log(chalk.white('  1. ') + chalk.dim('View transaction on Basescan:'));
    console.log(chalk.cyan('     https://basescan.org/tx/' + receipt.hash));
    console.log();
    console.log(chalk.white('  2. ') + chalk.dim('Verify your identity via CLI:'));
    console.log(chalk.cyan('     npx agentidbase verify ' + hash));
    console.log();
    console.log(chalk.white('  3. ') + chalk.dim('View your agent on the web:'));
    console.log(chalk.cyan('     https://id-agent.org/verify/' + hash));
    console.log();
    console.log(chalk.white('  4. ') + chalk.dim('Generate a QR code for easy verification:'));
    console.log(chalk.cyan('     npx agentidbase qr ' + hash));
    console.log();

  } catch (error: any) {
    spinner.fail('Anchoring failed');
    console.log();
    console.log(chalk.red('Error: ' + error.message));
    console.log();

    if (error.message.includes('Already anchored')) {
      console.log(chalk.yellow('This identity is already on-chain.'));
      console.log(chalk.dim('Use the verify command to check its status:'));
      console.log(chalk.cyan('  npx agentidbase verify ' + hash));
    } else {
      console.log(chalk.dim('Troubleshooting:'));
      console.log(chalk.dim('  • Check your private key is correct'));
      console.log(chalk.dim('  • Ensure you have ETH on Base for gas'));
      console.log(chalk.dim('  • Verify the RPC endpoint is accessible'));
      console.log(chalk.dim('  • Try again in a few moments'));
    }
    console.log();

    process.exit(1);
  }
}
