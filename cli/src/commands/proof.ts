/**
 * Proof command
 * Generates verification instructions that work without AgentID servers
 */

import chalk from 'chalk';

const DEFAULT_CONTRACT = process.env.AGENTID_CONTRACT || '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';
const DEFAULT_RPC = 'https://mainnet.base.org';

interface ProofOptions {
  rpc: string;
  contract?: string;
}

export async function proof(identityHash: string, options: ProofOptions): Promise<void> {
  console.log();
  console.log(chalk.bold.green('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.green('║') + chalk.bold('          AgentID - Independent Verification Proof          ') + chalk.bold.green('║'));
  console.log(chalk.bold.green('╚════════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.white('This proof allows you to verify an agent identity without relying'));
  console.log(chalk.white('on AgentID servers. Use these commands to query the blockchain directly.'));
  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  // Normalize hash
  const hash = identityHash.startsWith('0x') ? identityHash : `0x${identityHash}`;
  const contractAddress = options.contract || DEFAULT_CONTRACT;

  console.log(chalk.bold.cyan('IDENTITY INFORMATION'));
  console.log();
  console.log(chalk.dim('  Identity Hash: ') + chalk.cyan(hash));
  console.log(chalk.dim('  Chain:         ') + chalk.white('Base Mainnet (Chain ID: 8453)'));
  console.log(chalk.dim('  Contract:      ') + chalk.white(contractAddress));
  console.log(chalk.dim('  RPC Endpoint:  ') + chalk.white(options.rpc));
  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  console.log(chalk.bold.cyan('VERIFICATION METHODS'));
  console.log();
  console.log(chalk.white('Choose any method below to verify this identity independently:'));
  console.log();

  console.log(chalk.bold.yellow('Method 1: Using Foundry (cast)'));
  console.log(chalk.dim('Best for developers with Foundry installed'));
  console.log();
  console.log(chalk.gray('  ') + chalk.white(`cast call ${contractAddress} \\`));
  console.log(chalk.gray('    ') + chalk.white(`"verifyIdentity(bytes32)" ${hash} \\`));
  console.log(chalk.gray('    ') + chalk.white(`--rpc-url ${options.rpc}`));
  console.log();

  console.log(chalk.bold.yellow('Method 2: Using curl (raw JSON-RPC)'));
  console.log(chalk.dim('Works on any system with curl'));
  console.log();
  const calldata = '0xa7867212' + hash.slice(2).padStart(64, '0');
  console.log(chalk.gray('  ') + chalk.white(`curl -X POST ${options.rpc} \\`));
  console.log(chalk.gray('    ') + chalk.white(`-H "Content-Type: application/json" \\`));
  console.log(chalk.gray('    ') + chalk.white(`-d '{"jsonrpc":"2.0","id":1,"method":"eth_call",`));
  console.log(chalk.gray('    ') + chalk.white(`    "params":[{"to":"${contractAddress}",`));
  console.log(chalk.gray('    ') + chalk.white(`    "data":"${calldata}"},"latest"]}'`));
  console.log();

  console.log(chalk.bold.yellow('Method 3: Using ethers.js'));
  console.log(chalk.dim('For JavaScript/TypeScript applications'));
  console.log();
  console.log(chalk.gray('  ') + chalk.white(`const { ethers } = require('ethers');`));
  console.log(chalk.gray('  ') + chalk.white(`const provider = new ethers.JsonRpcProvider("${options.rpc}");`));
  console.log(chalk.gray('  ') + chalk.white(`const abi = ['function verifyIdentity(bytes32) view returns (bool)'];`));
  console.log(chalk.gray('  ') + chalk.white(`const contract = new ethers.Contract("${contractAddress}", abi, provider);`));
  console.log(chalk.gray('  ') + chalk.white(`const isValid = await contract.verifyIdentity("${hash}");`));
  console.log(chalk.gray('  ') + chalk.white(`console.log(isValid ? 'VALID' : 'INVALID');`));
  console.log();

  console.log(chalk.bold.yellow('Method 4: Block Explorer'));
  console.log(chalk.dim('Visual verification via Basescan'));
  console.log();
  console.log(chalk.gray('  ') + chalk.cyan(`https://basescan.org/address/${contractAddress}#readContract`));
  console.log(chalk.gray('  ') + chalk.dim('Enter the hash in the verifyIdentity function'));
  console.log();

  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold('Understanding Results:'));
  console.log();
  console.log(chalk.green('  • 0x01 or true  ') + chalk.dim('= Identity is VALID (anchored and not revoked)'));
  console.log(chalk.red('  • 0x00 or false ') + chalk.dim('= Identity is INVALID (not found or revoked)'));
  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.dim('AgentID serves as a notary service. The blockchain is the'));
  console.log(chalk.dim('ultimate source of truth - no trust in third parties required.'));
  console.log();
}
