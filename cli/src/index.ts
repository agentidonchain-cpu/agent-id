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
import { define } from './commands/define.js';
import { self } from './commands/self.js';
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
${chalk.bold.green('AgentID')} - Identidade Criptográfica para Agentes de IA

Registre seu agente na blockchain Base com verificação on-chain.
${chalk.bold.green('✓ GRÁTIS:')} Nós pagamos todas as taxas de gas!

${chalk.bold.yellow('═══ COMO USAR (3 PASSOS) ═══')}

  ${chalk.bold('1.')} ${chalk.cyan('npx agentidbase register')}        Registra + ancora on-chain ${chalk.green('(GRÁTIS)')}
  ${chalk.bold('2.')} ${chalk.cyan('npx agentidbase verify-twitter')}  Vincula Twitter ${chalk.dim('(opcional)')}
  ${chalk.bold('3.')} ${chalk.cyan('npx agentidbase verify <hash>')}   Verifica na blockchain

${chalk.bold.yellow('═══ TODOS OS COMANDOS ═══')}

  ${chalk.cyan('init')}              Cria arquivo agent.json
  ${chalk.cyan('register')}          Registra agente com config ${chalk.dim('(requer wallet)')}
  ${chalk.cyan('attest')}            Atesta agente de plataforma fechada ${chalk.dim('(ChatGPT, etc.)')}
  ${chalk.cyan('verify <hash>')}     Verifica identidade on-chain
  ${chalk.cyan('verify-twitter')}    Vincula conta do Twitter
  ${chalk.cyan('qr <hash>')}         Gera QR code de verificação
  ${chalk.cyan('proof <hash>')}      Mostra comandos para verificar manualmente

${chalk.bold('Website:')}  https://id-agent.org
${chalk.bold('Twitter:')}  @agentidbase
${chalk.bold('Contrato:')} ${DEFAULT_CONTRACT}
`)
  .version('0.1.6');

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
  .description('Create attestation for closed platform agents (ChatGPT, etc.) - DEFAULT')
  .option('--api <url>', 'AgentID API endpoint', 'https://agent007-api-production.up.railway.app')
  .option('-p, --platform <name>', 'Platform name (chatgpt, character.ai, etc.)')
  .option('-i, --id <identifier>', 'Agent URL or ID on the platform')
  .option('-n, --name <name>', 'Agent name')
  .action(attest);

program
  .command('define')
  .description('Create fingerprint from agent config (for open/self-hosted agents)')
  .option('-c, --config <path>', 'Path to agent.json config file')
  .option('--api <url>', 'AgentID API endpoint', 'https://agent007-api-production.up.railway.app')
  .option('--store-config', 'Store full config for public verification')
  .action(define);

program
  .command('self')
  .description('Agent self-registers with Ed25519 keypair (autonomous agents)')
  .option('--api <url>', 'AgentID API endpoint', 'https://agent007-api-production.up.railway.app')
  .option('-n, --name <name>', 'Agent name')
  .option('-k, --keypair <path>', 'Path to keypair file (generates if not exists)')
  .option('-e, --endpoint <url>', 'Agent endpoint URL')
  .option('--no-pow', 'Skip proof of work')
  .action(self);

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
