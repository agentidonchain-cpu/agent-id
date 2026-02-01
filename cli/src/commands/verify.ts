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
  console.log(chalk.bold('AgentID - Verify Identity'));
  console.log(chalk.dim('─'.repeat(40)));
  console.log();

  // Normalize hash
  const hash = identityHash.startsWith('0x') ? identityHash : `0x${identityHash}`;
  const contractAddress = options.contract || DEFAULT_CONTRACT;

  console.log(chalk.dim('Identity Hash:'));
  console.log(chalk.cyan(hash));
  console.log();
  console.log(chalk.dim('Contract:'));
  console.log(chalk.cyan(contractAddress));
  console.log();
  console.log(chalk.dim('RPC:'));
  console.log(chalk.cyan(options.rpc));
  console.log();

  const spinner = ora('Querying blockchain').start();

  try {
    const result = await verifyOnChain(hash, contractAddress, options.rpc);

    if (result.exists) {
      spinner.succeed('Identity found on-chain');
      console.log();

      if (result.valid) {
        console.log(chalk.bold.green('Status: VALID'));
      } else {
        console.log(chalk.bold.red('Status: REVOKED'));
      }

      console.log();
      console.log(chalk.dim('Creator:'));
      console.log(result.creator);
      console.log();
      console.log(chalk.dim('Anchored:'));
      console.log(new Date(result.anchoredAt * 1000).toISOString());

      if (result.revokedAt) {
        console.log();
        console.log(chalk.dim('Revoked:'));
        console.log(new Date(result.revokedAt * 1000).toISOString());
      }
    } else {
      spinner.warn('Identity not found on-chain');
      console.log();
      console.log(chalk.yellow('This identity has not been anchored.'));
    }

    console.log();

  } catch (error: any) {
    spinner.fail('Verification failed');
    console.log(chalk.red(error.message));
    console.log();
    console.log(chalk.dim('Manual verification:'));
    console.log(chalk.cyan(`cast call ${contractAddress} "verifyIdentity(bytes32)" ${hash} --rpc-url ${options.rpc}`));
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
  const functionSelector = '0xdee1f0e4'; // getIdentity(bytes32)
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
