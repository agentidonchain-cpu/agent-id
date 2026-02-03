/**
 * Verify command
 * Verifies an agent identity directly on-chain (no API dependency)
 */

import chalk from 'chalk';
import ora from 'ora';

// Default contract address (Base Mainnet)
const DEFAULT_CONTRACT = process.env.AGENTID_CONTRACT || '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';
const DEFAULT_RPC = 'https://mainnet.base.org';

interface VerifyOptions {
  rpc: string;
  contract?: string;
}

export async function verify(identityHash: string, options: VerifyOptions): Promise<void> {
  console.log();
  console.log(chalk.bold.green('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.green('║') + chalk.bold('           AgentID - Verify Agent Identity                ') + chalk.bold.green('║'));
  console.log(chalk.bold.green('╚════════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.white('This command verifies an agent\'s identity directly on the Base blockchain.'));
  console.log(chalk.white('No API or third-party trust required - fully decentralized verification.'));
  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  // Normalize hash
  const hash = identityHash.startsWith('0x') ? identityHash : `0x${identityHash}`;
  const contractAddress = options.contract || DEFAULT_CONTRACT;

  console.log(chalk.bold.cyan('VERIFICATION REQUEST'));
  console.log();
  console.log(chalk.dim('  Identity Hash: ') + chalk.cyan(hash));
  console.log(chalk.dim('  Contract:      ') + chalk.white(contractAddress));
  console.log(chalk.dim('  Chain:         ') + chalk.white('Base Mainnet (8453)'));
  console.log(chalk.dim('  RPC:           ') + chalk.white(options.rpc));
  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  const spinner = ora('Querying Base blockchain...').start();

  try {
    const result = await verifyOnChain(hash, contractAddress, options.rpc);

    if (result.exists) {
      spinner.succeed('Identity found on-chain');
      console.log();
      console.log(chalk.dim('─'.repeat(60)));
      console.log();

      if (result.valid) {
        console.log(chalk.bold.green('╔════════════════════════════════════════════════════════════╗'));
        console.log(chalk.bold.green('║') + chalk.bold.green('                    ✓ IDENTITY VALID                        ') + chalk.bold.green('║'));
        console.log(chalk.bold.green('╚════════════════════════════════════════════════════════════╝'));
      } else {
        console.log(chalk.bold.red('╔════════════════════════════════════════════════════════════╗'));
        console.log(chalk.bold.red('║') + chalk.bold.red('                    ✗ IDENTITY REVOKED                       ') + chalk.bold.red('║'));
        console.log(chalk.bold.red('╚════════════════════════════════════════════════════════════╝'));
      }

      console.log();
      console.log(chalk.bold('On-Chain Details:'));
      console.log();
      console.log(chalk.dim('  Status:   ') + (result.valid ? chalk.green('VALID') : chalk.red('REVOKED')));
      console.log(chalk.dim('  Creator:  ') + chalk.white(result.creator));
      console.log(chalk.dim('  Anchored: ') + chalk.white(new Date(result.anchoredAt * 1000).toISOString()));

      if (result.revokedAt) {
        console.log(chalk.dim('  Revoked:  ') + chalk.red(new Date(result.revokedAt * 1000).toISOString()));
      }

      console.log();
      console.log(chalk.dim('─'.repeat(60)));
      console.log();
      console.log(chalk.bold('What This Means:'));
      console.log();
      if (result.valid) {
        console.log(chalk.green('  ✓ ') + chalk.white('This agent identity was registered on the blockchain'));
        console.log(chalk.green('  ✓ ') + chalk.white('The identity hash has not been modified since anchoring'));
        console.log(chalk.green('  ✓ ') + chalk.white('The identity has not been revoked by the creator'));
      } else {
        console.log(chalk.red('  ✗ ') + chalk.white('This identity was revoked by its creator'));
        console.log(chalk.red('  ✗ ') + chalk.white('The agent may have been updated or deprecated'));
      }

      console.log();
      console.log(chalk.dim('─'.repeat(60)));
      console.log();
      console.log(chalk.bold('Verification Links:'));
      console.log();
      console.log(chalk.dim('  Web:      ') + chalk.cyan('https://id-agent.org/verify/' + hash));
      console.log(chalk.dim('  Basescan: ') + chalk.cyan('https://basescan.org/address/' + contractAddress + '#readContract'));
      console.log();

    } else {
      spinner.warn('Identity NOT found on-chain');
      console.log();
      console.log(chalk.dim('─'.repeat(60)));
      console.log();
      console.log(chalk.bold.yellow('╔════════════════════════════════════════════════════════════╗'));
      console.log(chalk.bold.yellow('║') + chalk.bold.yellow('                  IDENTITY NOT ANCHORED                     ') + chalk.bold.yellow('║'));
      console.log(chalk.bold.yellow('╚════════════════════════════════════════════════════════════╝'));
      console.log();
      console.log(chalk.yellow('This identity hash was not found on the Base blockchain.'));
      console.log();
      console.log(chalk.dim('Possible reasons:'));
      console.log(chalk.dim('  • The agent has not been anchored yet'));
      console.log(chalk.dim('  • The identity hash is incorrect'));
      console.log(chalk.dim('  • The agent was registered on a different network'));
      console.log();
      console.log(chalk.dim('If you own this agent, navigate to its directory and run:'));
      console.log(chalk.cyan('  agentid anchor'));
      console.log();
    }

  } catch (error: any) {
    spinner.fail('Verification failed');
    console.log();
    console.log(chalk.red('Error: ' + error.message));
    console.log();
    console.log(chalk.dim('Troubleshooting:'));
    console.log(chalk.dim('  • Check that the identity hash is valid (0x + 64 hex chars)'));
    console.log(chalk.dim('  • Verify your internet connection'));
    console.log(chalk.dim('  • Try an alternative RPC endpoint'));
    console.log();
    console.log(chalk.dim('Manual verification using Foundry cast:'));
    console.log(chalk.cyan(`  cast call ${contractAddress} "verifyIdentity(bytes32)" ${hash} --rpc-url ${options.rpc}`));
    console.log();
    process.exit(1);
  }
}

interface VerifyResult {
  exists: boolean;
  valid: boolean;
  creator: string;
  anchoredAt: number;
  revokedAt?: number;
}

async function verifyOnChain(
  hash: string,
  contractAddress: string,
  rpcUrl: string
): Promise<VerifyResult> {
  // Encode the function call: getIdentity(bytes32)
  // Function selector: 0x... (first 4 bytes of keccak256("getIdentity(bytes32)"))
  const functionSelector = '0xa7867212'; // getIdentity(bytes32)
  const paddedHash = hash.slice(2).padStart(64, '0');
  const data = functionSelector + paddedHash;

  const response = await fetch(rpcUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [
        {
          to: contractAddress,
          data: data,
        },
        'latest',
      ],
    }),
  });

  const result = await response.json();

  if (result.error) {
    throw new Error(result.error.message);
  }

  // Decode result (bool exists, address creator, uint256 anchoredAt, uint256 revokedAt, bool isValid)
  const decoded = decodeGetIdentityResult(result.result);
  return decoded;
}

function decodeGetIdentityResult(hexData: string): VerifyResult {
  // Remove 0x prefix
  const data = hexData.slice(2);

  // Each value is 32 bytes (64 hex chars)
  const exists = parseInt(data.slice(0, 64), 16) === 1;
  const creator = '0x' + data.slice(64 + 24, 128); // address is 20 bytes, right-padded
  const anchoredAt = parseInt(data.slice(128, 192), 16);
  const revokedAt = parseInt(data.slice(192, 256), 16);
  const isValid = parseInt(data.slice(256, 320), 16) === 1;

  return {
    exists,
    valid: isValid,
    creator,
    anchoredAt,
    revokedAt: revokedAt > 0 ? revokedAt : undefined,
  };
}
