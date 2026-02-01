/**
 * Proof command
 * Generates verification instructions that work without AgentID servers
 */

import chalk from 'chalk';

const DEFAULT_CONTRACT = process.env.AGENTID_CONTRACT || '0x0000000000000000000000000000000000000000';
const DEFAULT_RPC = 'https://mainnet.base.org';

interface ProofOptions {
  rpc: string;
  contract?: string;
}

export async function proof(identityHash: string, options: ProofOptions): Promise<void> {
  console.log();
  console.log(chalk.bold('AgentID - Verification Proof'));
  console.log(chalk.dim('─'.repeat(50)));
  console.log();

  // Normalize hash
  const hash = identityHash.startsWith('0x') ? identityHash : `0x${identityHash}`;
  const contractAddress = options.contract || DEFAULT_CONTRACT;

  console.log(chalk.bold('Identity'));
  console.log(chalk.dim('Hash:     ') + chalk.cyan(hash));
  console.log();

  console.log(chalk.bold('Blockchain'));
  console.log(chalk.dim('Chain:    ') + 'Base Mainnet (8453)');
  console.log(chalk.dim('Contract: ') + chalk.cyan(contractAddress));
  console.log(chalk.dim('RPC:      ') + options.rpc);
  console.log();

  console.log(chalk.bold('Verify without AgentID'));
  console.log();
  console.log(chalk.dim('Using cast (foundry):'));
  console.log(chalk.white(`  cast call ${contractAddress} \\`));
  console.log(chalk.white(`    "verifyIdentity(bytes32)" ${hash} \\`));
  console.log(chalk.white(`    --rpc-url ${options.rpc}`));
  console.log();

  console.log(chalk.dim('Using curl (raw JSON-RPC):'));
  const calldata = '0xdee1f0e4' + hash.slice(2).padStart(64, '0');
  console.log(chalk.white(`  curl -X POST ${options.rpc} \\`));
  console.log(chalk.white(`    -H "Content-Type: application/json" \\`));
  console.log(chalk.white(`    -d '{"jsonrpc":"2.0","id":1,"method":"eth_call","params":[{"to":"${contractAddress}","data":"${calldata}"},"latest"]}'`));
  console.log();

  console.log(chalk.dim('Using ethers.js:'));
  console.log(chalk.white(`  const provider = new ethers.JsonRpcProvider("${options.rpc}");`));
  console.log(chalk.white(`  const contract = new ethers.Contract("${contractAddress}", ABI, provider);`));
  console.log(chalk.white(`  const isValid = await contract.verifyIdentity("${hash}");`));
  console.log();

  console.log(chalk.dim('Block explorer:'));
  console.log(chalk.cyan(`  https://basescan.org/address/${contractAddress}#readContract`));
  console.log();

  console.log(chalk.dim('─'.repeat(50)));
  console.log(chalk.dim('AgentID acts as a notary. The blockchain is the source of truth.'));
  console.log();
}
