#!/usr/bin/env node
/**
 * AgentID CLI
 * Register and verify AI agent identities on-chain
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { init } from './commands/init.js';
import { register } from './commands/register.js';
import { attest } from './commands/attest.js';
import { anchor } from './commands/anchor.js';
import { verify } from './commands/verify.js';
import { proof } from './commands/proof.js';
import { qr } from './commands/qr.js';
import { verifyTwitter } from './commands/verify-twitter.js';

// Default contract address (Base Mainnet)
const DEFAULT_CONTRACT = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';

const program = new Command();

program
  .name('agentidbase')
  .description(`
${chalk.bold.green('AgentID')} - Cryptographic Identity for AI Agents

Create, register, and verify AI agent identities on the Base blockchain.
Each agent gets a unique identity hash based on its configuration.

${chalk.bold.green('✓ FREE:')} Registration and on-chain anchoring are free - we pay the gas!

${chalk.bold('Quick Start:')}
  ${chalk.cyan('npx agentidbase init')}              Create agent.json config file
  ${chalk.cyan('npx agentidbase register')}          Register with verified config (FREE)
  ${chalk.cyan('npx agentidbase attest')}            Declare ownership (closed platforms)
  ${chalk.cyan('npx agentidbase verify <hash>')}     Verify any agent identity
  ${chalk.cyan('npx agentidbase verify-twitter')}    Link Twitter to your agent
  ${chalk.cyan('npx agentidbase qr <hash>')}         Generate QR code for verification

${chalk.bold('Contract:')} ${DEFAULT_CONTRACT}
${chalk.bold('Chain:')}    Base Mainnet (Chain ID: 8453)
${chalk.bold('Website:')}  https://id-agent.org
${chalk.bold('Twitter:')}  @agentidbase
`)
  .version('0.1.3');

program
  .command('init')
  .description('Create an agent.json configuration file in the current directory')
  .option('-f, --force', 'Overwrite existing agent.json without asking')
  .action(init);

program
  .command('register')
  .description('Register a new agent and generate its identity hash')
  .option('-c, --config <path>', 'Path to agent.json config file')
  .option('--api <url>', 'AgentID API endpoint', 'https://agent007-api-production.up.railway.app')
  .option('--no-anchor', 'Skip blockchain anchoring (register only)')
  .action(register);

program
  .command('attest')
  .description('Create attestation for closed platform agents (ChatGPT, etc.)')
  .option('--api <url>', 'AgentID API endpoint', 'https://agent007-api-production.up.railway.app')
  .option('-p, --platform <name>', 'Platform name (chatgpt, character.ai, etc.)')
  .option('-i, --id <identifier>', 'Agent URL or ID on the platform')
  .option('-n, --name <name>', 'Agent name')
  .action(attest);

program
  .command('anchor <identityHash>')
  .description('Anchor an agent identity on Base Mainnet blockchain')
  .option('--rpc <url>', 'Base RPC endpoint', 'https://mainnet.base.org')
  .option('--contract <address>', 'AgentID contract address', DEFAULT_CONTRACT)
  .option('--private-key <key>', 'Wallet private key (or set AGENTID_PRIVATE_KEY env var)')
  .action(anchor);

program
  .command('verify <identityHash>')
  .description('Verify an agent identity directly on the blockchain')
  .option('--rpc <url>', 'Base RPC endpoint', 'https://mainnet.base.org')
  .option('--contract <address>', 'AgentID contract address', DEFAULT_CONTRACT)
  .action(verify);

program
  .command('proof <identityHash>')
  .description('Generate a cryptographic proof for an agent identity')
  .option('--rpc <url>', 'Base RPC endpoint', 'https://mainnet.base.org')
  .option('--contract <address>', 'AgentID contract address', DEFAULT_CONTRACT)
  .action(proof);

program
  .command('qr <identityHash>')
  .description('Generate a QR code for easy agent verification')
  .option('-o, --output <filename>', 'Output filename (default: agent-{hash}.png)')
  .option('-s, --size <pixels>', 'QR code size in pixels', '512')
  .option('-d, --dir <directory>', 'Output directory', process.cwd())
  .action(qr);

// Verify Twitter subcommand
const verifyCmd = program
  .command('verify-twitter [handle]')
  .description('Link a Twitter account to your agent identity')
  .option('--identity-hash <hash>', 'Agent identity hash (0x...)')
  .option('--tweet-url <url>', 'Tweet URL (skip interactive prompt)')
  .option('--api <url>', 'AgentID API endpoint', 'https://agent007-api-production.up.railway.app')
  .action(verifyTwitter);

// Show help if no command provided
if (process.argv.length === 2) {
  program.outputHelp();
}

program.parse();
