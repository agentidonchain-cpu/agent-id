#!/usr/bin/env node
/**
 * OpenClaw Fingerprint CLI
 *
 * Usage:
 *   openclaw-fingerprint                    # Default output
 *   openclaw-fingerprint --json             # JSON output
 *   openclaw-fingerprint --agent work       # Specific agent
 *   openclaw-fingerprint --verify 0x...     # Verify against registered fingerprint
 *
 * This CLI is local, offline, and deterministic.
 * It does NOT call any external APIs or register anything.
 */

import { getFingerprint, verifyFingerprint } from './index.js';

// =============================================================================
// ARGUMENT PARSING
// =============================================================================

interface CliArgs {
  json: boolean;
  agent?: string;
  verify?: string;
  config?: string;
  workspace?: string;
  help: boolean;
}

function parseArgs(args: string[]): CliArgs {
  const result: CliArgs = {
    json: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--json' || arg === '-j') {
      result.json = true;
    } else if (arg === '--help' || arg === '-h') {
      result.help = true;
    } else if (arg === '--agent' || arg === '-a') {
      result.agent = args[++i];
    } else if (arg === '--verify' || arg === '-v') {
      result.verify = args[++i];
    } else if (arg === '--config' || arg === '-c') {
      result.config = args[++i];
    } else if (arg === '--workspace' || arg === '-w') {
      result.workspace = args[++i];
    }
  }

  return result;
}

// =============================================================================
// HELP TEXT
// =============================================================================

function showHelp(): void {
  console.log(`
OpenClaw Fingerprint - Agent ID Identity Calculator

USAGE:
  openclaw-fingerprint [options]

OPTIONS:
  --json, -j              Output as JSON
  --agent, -a <id>        Target specific agent by ID (default: main)
  --verify, -v <hash>     Verify against registered fingerprint
  --config, -c <path>     Custom config file path
  --workspace, -w <path>  Custom workspace path
  --help, -h              Show this help

EXAMPLES:
  # Calculate fingerprint for default agent
  openclaw-fingerprint

  # Output as JSON (includes canonical manifest)
  openclaw-fingerprint --json

  # Calculate for specific agent
  openclaw-fingerprint --agent work

  # Verify against registered fingerprint
  openclaw-fingerprint --verify 0xabc123...

ENVIRONMENT:
  OPENCLAW_CONFIG_PATH    Override config file location
  OPENCLAW_WORKSPACE      Override workspace location

This tool is local and offline. It does NOT:
  - Call external APIs
  - Register the agent
  - Require wallet or authentication
  - Modify any files

It simply calculates the deterministic fingerprint of your local agent.
`);
}

// =============================================================================
// OUTPUT FORMATTERS
// =============================================================================

function formatDefault(result: ReturnType<typeof getFingerprint>): void {
  console.log(`
╔════════════════════════════════════════════════════════════════════╗
║                    OpenClaw Agent Fingerprint                      ║
╚════════════════════════════════════════════════════════════════════╝

Fingerprint: ${result.fingerprint}
Schema:      ${result.schema}

Agent:
  Name:        ${result.manifest.agent_name}
  Description: ${result.manifest.agent_description.slice(0, 60)}${result.manifest.agent_description.length > 60 ? '...' : ''}
  Role:        ${result.manifest.agent_role.slice(0, 60)}${result.manifest.agent_role.length > 60 ? '...' : ''}
  Skills:      ${result.manifest.skills.length} installed

Sources:
  Config:      ${result.sources.config || '(not found)'}
  Workspace:   ${result.sources.workspace || '(not found)'}
  Skills Dir:  ${result.sources.skillsDir || '(not found)'}

─────────────────────────────────────────────────────────────────────
Use --json for full manifest details
Use --verify <hash> to compare against a registered Agent ID
`);
}

function formatJson(result: ReturnType<typeof getFingerprint>): void {
  console.log(JSON.stringify({
    schema: result.schema,
    fingerprint: result.fingerprint,
    manifest: result.manifest,
    canonical_manifest: result.canonical,
    sources: result.sources,
  }, null, 2));
}

function formatVerify(verification: ReturnType<typeof verifyFingerprint>): void {
  const icon = verification.match ? '✓' : '✗';
  const color = verification.match ? '\x1b[32m' : '\x1b[31m';
  const reset = '\x1b[0m';

  console.log(`
${color}${icon} ${verification.message}${reset}

Computed:   ${verification.computed}
Registered: ${verification.registered}
`);

  process.exit(verification.match ? 0 : 1);
}

// =============================================================================
// MAIN
// =============================================================================

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    showHelp();
    process.exit(0);
  }

  const options = {
    agentId: args.agent,
    configPath: args.config,
    workspacePath: args.workspace,
  };

  try {
    if (args.verify) {
      // Verification mode
      const verification = verifyFingerprint(args.verify, options);
      formatVerify(verification);
    } else {
      // Fingerprint mode
      const result = getFingerprint(options);

      if (args.json) {
        formatJson(result);
      } else {
        formatDefault(result);
      }
    }
  } catch (error: any) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}

main();
