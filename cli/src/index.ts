#!/usr/bin/env node
/**
 * AgentID CLI
 * Register and verify AI agent identities on-chain
 */

import { Command } from 'commander';
import { register } from './commands/register.js';
import { verify } from './commands/verify.js';
import { proof } from './commands/proof.js';

const program = new Command();

program
  .name('agentid')
  .description('CLI for registering and verifying AI agent identities on-chain')
  .version('0.1.0');

program
  .command('register')
  .description('Register a new agent identity')
  .option('-c, --config <path>', 'Path to agent config file (JSON)')
  .option('--api <url>', 'API endpoint', 'https://api.agentid.xyz')
  .option('--no-anchor', 'Skip blockchain anchoring')
  .action(register);

program
  .command('verify <identityHash>')
  .description('Verify an agent identity on-chain')
  .option('--rpc <url>', 'RPC endpoint', 'https://mainnet.base.org')
  .option('--contract <address>', 'Contract address')
  .action(verify);

program
  .command('proof <identityHash>')
  .description('Generate verification proof for an identity')
  .option('--rpc <url>', 'RPC endpoint', 'https://mainnet.base.org')
  .option('--contract <address>', 'Contract address')
  .action(proof);

program.parse();
