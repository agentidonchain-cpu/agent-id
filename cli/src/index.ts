#!/usr/bin/env node
/**
 * AgentID CLI
 *
 * Cartório, não incubadora.
 * Registra existência, não cria agentes.
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { fingerprint } from './commands/fingerprint.js';
import { anchor } from './commands/anchor.js';
import { verify } from './commands/verify.js';
import { qr } from './commands/qr.js';
import { verifyTwitter } from './commands/verify-twitter.js';

const CONTRACT = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa';

const program = new Command();

program
  .name('agentid')
  .description(`${chalk.bold.green('AgentID')} — Cryptographic identity for AI agents

${chalk.dim('Contract:')} ${CONTRACT}
${chalk.dim('Website:')}  https://id-agent.org`)
  .version('0.2.0');

// fingerprint - detect and generate hash
program
  .command('fingerprint')
  .alias('fp')
  .description('Detect and generate agent fingerprint from current directory')
  .option('-q, --quiet', 'Output only the fingerprint hash')
  .option('--json', 'Output as JSON')
  .action(fingerprint);

// anchor - register on-chain
program
  .command('anchor')
  .description('Register fingerprint on-chain (recalculates automatically)')
  .option('--local', 'Use local wallet instead of free API')
  .option('--private-key <key>', 'Wallet private key (or AGENTID_PRIVATE_KEY env)')
  .option('--rpc <url>', 'Base RPC endpoint', 'https://mainnet.base.org')
  .option('--api <url>', 'AgentID API endpoint', 'https://agent007-api-production.up.railway.app')
  .action(anchor);

// verify - check on-chain
program
  .command('verify <hash>')
  .description('Verify an identity on the blockchain')
  .option('--rpc <url>', 'Base RPC endpoint', 'https://mainnet.base.org')
  .option('--proof', 'Show manual verification commands')
  .action(verify);

// twitter - link Twitter account
program
  .command('twitter [handle]')
  .alias('verify-twitter')
  .description('Link a Twitter account to your agent identity')
  .option('--identity-hash <hash>', 'Agent identity hash')
  .option('--tweet-url <url>', 'Tweet URL (skip interactive prompt)')
  .option('--api <url>', 'AgentID API endpoint', 'https://agent007-api-production.up.railway.app')
  .action(verifyTwitter);

// qr - generate QR code
program
  .command('qr <hash>')
  .description('Generate a QR code for verification')
  .option('-o, --output <filename>', 'Output filename')
  .option('-s, --size <pixels>', 'QR code size', '512')
  .action(qr);

// Legacy aliases (hidden, for backwards compatibility)
program
  .command('register', { hidden: true })
  .description('Deprecated: use fingerprint + anchor')
  .action(() => {
    console.log(chalk.yellow('`register` is deprecated.'));
    console.log();
    console.log(chalk.white('Use the new flow:'));
    console.log(chalk.cyan('  agentid fingerprint'));
    console.log(chalk.cyan('  agentid anchor'));
    console.log();
  });

program
  .command('init', { hidden: true })
  .description('Deprecated: not needed')
  .action(() => {
    console.log(chalk.yellow('`init` is deprecated.'));
    console.log();
    console.log(chalk.white('AgentID auto-detects your agent configuration.'));
    console.log(chalk.white('Just run:'));
    console.log(chalk.cyan('  agentid fingerprint'));
    console.log();
  });

program.parse();
