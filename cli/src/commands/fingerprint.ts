/**
 * fingerprint command
 *
 * Detects and generates agent fingerprint automatically.
 * NO QUESTIONS. NO WIZARD. Just hash.
 */

import { createHash } from 'crypto';
import { readFile, writeFile, mkdir, stat } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import chalk from 'chalk';

interface FingerprintResult {
  fingerprint: string;
  origin: 'openclaw' | 'config' | 'git' | 'directory';
  status: 'not_registered' | 'registered' | 'unknown';
  source?: string;
}

interface FingerprintOptions {
  quiet?: boolean;
  json?: boolean;
}

const CACHE_DIR = '.agentid';
const CACHE_FILE = 'fingerprint';

/**
 * Detect and generate fingerprint from current environment.
 * Priority:
 * 1. OpenClaw manifest (openclaw.json)
 * 2. Agent config (agent.json, agentid.json)
 * 3. Git repo hash
 * 4. Directory hash (fallback)
 */
export async function fingerprint(options: FingerprintOptions = {}): Promise<void> {
  const result = await detectFingerprint();

  // Cache the fingerprint
  await cacheFingerprint(result);

  // Output
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  if (options.quiet) {
    console.log(result.fingerprint);
    return;
  }

  // Standard output - minimal, clean
  console.log();
  console.log(chalk.dim('fingerprint: ') + chalk.bold.green(result.fingerprint));
  console.log(chalk.dim('origin:      ') + chalk.white(result.origin));
  if (result.source) {
    console.log(chalk.dim('source:      ') + chalk.white(result.source));
  }
  console.log(chalk.dim('status:      ') + chalk.yellow(result.status.replace('_', ' ')));
  console.log();
  console.log(chalk.dim('next: ') + chalk.cyan('agentid anchor'));
  console.log();
}

/**
 * Detect fingerprint from environment - NO QUESTIONS
 */
export async function detectFingerprint(): Promise<FingerprintResult> {
  const cwd = process.cwd();

  // 1. Check for OpenClaw manifest
  const openclawPath = join(cwd, 'openclaw.json');
  if (existsSync(openclawPath)) {
    try {
      const content = await readFile(openclawPath, 'utf-8');
      const manifest = JSON.parse(content);
      const fp = hashOpenClaw(manifest);
      return {
        fingerprint: fp,
        origin: 'openclaw',
        status: 'not_registered',
        source: 'openclaw.json',
      };
    } catch {
      // Invalid JSON, continue to next
    }
  }

  // 2. Check for agent config files
  const configFiles = ['agent.json', 'agentid.json', '.agentid.json'];
  for (const file of configFiles) {
    const configPath = join(cwd, file);
    if (existsSync(configPath)) {
      try {
        const content = await readFile(configPath, 'utf-8');
        const config = JSON.parse(content);
        const fp = hashConfig(config);
        return {
          fingerprint: fp,
          origin: 'config',
          status: 'not_registered',
          source: file,
        };
      } catch {
        // Invalid JSON, continue
      }
    }
  }

  // 3. Check for git repo
  if (existsSync(join(cwd, '.git'))) {
    try {
      const gitHash = execSync('git rev-parse HEAD', { encoding: 'utf-8', cwd }).trim();
      const fp = '0x' + createHash('sha256').update(`git:${gitHash}`).digest('hex');
      return {
        fingerprint: fp,
        origin: 'git',
        status: 'not_registered',
        source: gitHash.slice(0, 8),
      };
    } catch {
      // Git command failed, continue
    }
  }

  // 4. Fallback: hash the directory path + timestamp seed
  const dirHash = createHash('sha256')
    .update(`dir:${cwd}:${Date.now()}`)
    .digest('hex');

  return {
    fingerprint: '0x' + dirHash,
    origin: 'directory',
    status: 'not_registered',
    source: cwd.split('/').pop(),
  };
}

/**
 * Hash OpenClaw manifest (deterministic)
 */
function hashOpenClaw(manifest: Record<string, unknown>): string {
  // Canonical JSON (sorted keys)
  const canonical = JSON.stringify(manifest, Object.keys(manifest).sort());
  return '0x' + createHash('sha256').update(canonical).digest('hex');
}

/**
 * Hash agent config (deterministic)
 */
function hashConfig(config: Record<string, unknown>): string {
  // Extract relevant fields for hashing
  const hashable = {
    name: config.name,
    description: config.description,
    model: config.model,
    systemPrompt: config.systemPrompt || config.system_prompt,
    parameters: config.parameters,
  };

  const canonical = JSON.stringify(hashable, Object.keys(hashable).sort());
  return '0x' + createHash('sha256').update(canonical).digest('hex');
}

/**
 * Cache fingerprint for anchor command
 */
async function cacheFingerprint(result: FingerprintResult): Promise<void> {
  try {
    const cacheDir = join(process.cwd(), CACHE_DIR);
    if (!existsSync(cacheDir)) {
      await mkdir(cacheDir, { recursive: true });
    }

    const cachePath = join(cacheDir, CACHE_FILE);
    await writeFile(cachePath, JSON.stringify({
      ...result,
      cachedAt: new Date().toISOString(),
    }, null, 2));
  } catch {
    // Cache write failed, not critical
  }
}

/**
 * Get cached fingerprint (for anchor command)
 */
export async function getCachedFingerprint(): Promise<FingerprintResult | null> {
  try {
    const cachePath = join(process.cwd(), CACHE_DIR, CACHE_FILE);
    if (!existsSync(cachePath)) {
      return null;
    }

    const content = await readFile(cachePath, 'utf-8');
    return JSON.parse(content);
  } catch {
    return null;
  }
}

export default fingerprint;
