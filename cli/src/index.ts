#!/usr/bin/env node
/**
 * AgentID CLI
 * Register and verify AI agent identities on-chain
 */

import { Command } from 'commander';
import { init } from './commands/init.js';
import { register } from './commands/register.js';
import { anchor } from './commands/anchor.js';
import { verify } from './commands/verify.js';
import { proof } from './commands/proof.js';
import { qr } from './commands/qr.js';

// Default contract address (Base Mainnet)
const DEFAULT_CONTRACT = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';

const program = new Command();

program
  .name('agentid')
  .description('CLI for registering and verifying AI agent identities on-chain')
  .version('0.1.0');

program
  .command('init')
  .description('Create agent.json config file')
  .option('-f, --force', 'Overwrite existing file')
  .action(init);

program
  .command('register')
  .description('Register a new agent identity')
  .option('-c, --config <path>', 'Path to agent config file (JSON)')
  .option('--api <url>', 'API endpoint', 'https://agent007-api-production.up.railway.app')
  .option('--no-anchor', 'Skip blockchain anchoring')
  .action(register);

program
  .command('anchor <identityHash>')
  .description('Anchor an identity on-chain (Base Mainnet)')
  .option('--rpc <url>', 'RPC endpoint', 'https://mainnet.base.org')
  .option('--contract <address>', 'Contract address', DEFAULT_CONTRACT)
  .option('--private-key <key>', 'Private key for signing')
  .action(anchor);

program
  .command('verify <identityHash>')
  .description('Verify an agent identity on-chain')
  .option('--rpc <url>', 'RPC endpoint', 'https://mainnet.base.org')
  .option('--contract <address>', 'Contract address', DEFAULT_CONTRACT)
  .action(verify);

program
  .command('proof <identityHash>')
  .description('Generate verification proof for an identity')
  .option('--rpc <url>', 'RPC endpoint', 'https://mainnet.base.org')
  .option('--contract <address>', 'Contract address', DEFAULT_CONTRACT)
  .action(proof);

program
  .command('qr <identityHash>')
  .description('Generate QR code for agent verification')
  .option('-o, --output <filename>', 'Output filename (default: agent-{hash}.png)')
  .option('-s, --size <pixels>', 'QR code size in pixels', '512')
  .option('-d, --dir <directory>', 'Output directory', process.cwd())
  .action(qr);

program.parse();
