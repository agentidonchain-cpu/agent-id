/**
 * OpenClaw Fingerprint Plugin
 *
 * Calculates deterministic Agent ID fingerprint from local OpenClaw agent.
 *
 * This plugin:
 * - Extracts manifest from local OpenClaw configuration
 * - Canonicalizes the manifest deterministically
 * - Calculates SHA256 fingerprint
 * - Outputs fingerprint for Agent ID verification
 *
 * This plugin does NOT:
 * - Call external APIs
 * - Register the agent
 * - Require wallet/auth
 * - Modify any files
 * - Persist any state
 *
 * It is purely local, offline, and deterministic.
 */

import { createHash } from 'crypto';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import JSON5 from 'json5';
import yaml from 'js-yaml';

// =============================================================================
// TYPES
// =============================================================================

export interface OpenClawManifest {
  schema_version: 'openclaw-manifest-v1';
  agent_name: string;
  agent_description: string;
  agent_role: string;
  skills: OpenClawSkill[];
}

export interface OpenClawSkill {
  name: string;
  version: string;
  description?: string;
}

export interface FingerprintResult {
  fingerprint: string;
  schema: string;
  manifest: OpenClawManifest;
  canonical: string;
  sources: {
    config: string | null;
    workspace: string | null;
    skillsDir: string | null;
  };
}

// =============================================================================
// CONFIGURATION PATHS
// =============================================================================

function getConfigPath(): string {
  return process.env.OPENCLAW_CONFIG_PATH || join(homedir(), '.openclaw', 'openclaw.json');
}

function getWorkspacePath(configWorkspace?: string): string {
  return configWorkspace || process.env.OPENCLAW_WORKSPACE || join(homedir(), '.openclaw', 'workspace');
}

// =============================================================================
// CONFIG READER
// =============================================================================

interface OpenClawConfig {
  agents?: {
    defaults?: {
      workspace?: string;
    };
    list?: Array<{
      id: string;
      name?: string;
      default?: boolean;
      workspace?: string;
      identity?: {
        name?: string;
        theme?: string;
        emoji?: string;
      };
    }>;
  };
}

function readConfig(configPath: string): OpenClawConfig | null {
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const content = readFileSync(configPath, 'utf-8');
    return JSON5.parse(content) as OpenClawConfig;
  } catch (error) {
    console.error(`Warning: Failed to parse config at ${configPath}`);
    return null;
  }
}

// =============================================================================
// WORKSPACE FILE READERS
// =============================================================================

/**
 * Read IDENTITY.md from workspace
 * Returns: { name, theme, description } or defaults
 */
function readIdentityMd(workspacePath: string): { name?: string; theme?: string; description?: string } {
  const identityPath = join(workspacePath, 'IDENTITY.md');

  if (!existsSync(identityPath)) {
    return {};
  }

  try {
    const content = readFileSync(identityPath, 'utf-8');

    // Try to parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = yaml.load(frontmatterMatch[1]) as Record<string, unknown>;
      return {
        name: frontmatter.name as string | undefined,
        theme: frontmatter.theme as string | undefined,
        description: frontmatter.description as string | undefined,
      };
    }

    // Fallback: extract first heading as name
    const headingMatch = content.match(/^#\s+(.+)$/m);
    const name = headingMatch ? headingMatch[1].trim() : undefined;

    // Extract first paragraph as description
    const paragraphMatch = content.match(/^(?!#)(?!---).+$/m);
    const description = paragraphMatch ? paragraphMatch[0].trim() : undefined;

    return { name, description };
  } catch {
    return {};
  }
}

/**
 * Read SOUL.md from workspace
 * Returns: role/purpose extracted from content
 */
function readSoulMd(workspacePath: string): { role?: string } {
  const soulPath = join(workspacePath, 'SOUL.md');

  if (!existsSync(soulPath)) {
    return {};
  }

  try {
    const content = readFileSync(soulPath, 'utf-8');

    // Try to parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      const frontmatter = yaml.load(frontmatterMatch[1]) as Record<string, unknown>;
      return {
        role: (frontmatter.role || frontmatter.purpose || frontmatter.theme) as string | undefined,
      };
    }

    // Fallback: look for "Core Truths" or similar section
    const roleMatch = content.match(/(?:role|purpose|mission)[:\s]+(.+)/i);
    if (roleMatch) {
      return { role: roleMatch[1].trim() };
    }

    // Use first non-heading line as role summary
    const lines = content.split('\n').filter(l => l.trim() && !l.startsWith('#') && !l.startsWith('---'));
    if (lines.length > 0) {
      return { role: lines[0].trim().slice(0, 200) };
    }

    return {};
  } catch {
    return {};
  }
}

// =============================================================================
// SKILLS READER
// =============================================================================

interface SkillFrontmatter {
  name?: string;
  description?: string;
  version?: string;
  changelog?: string;
}

/**
 * Read SKILL.md frontmatter from a skill directory
 */
function readSkillMd(skillDir: string): SkillFrontmatter | null {
  const skillMdPath = join(skillDir, 'SKILL.md');

  if (!existsSync(skillMdPath)) {
    return null;
  }

  try {
    const content = readFileSync(skillMdPath, 'utf-8');

    // Parse YAML frontmatter
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (frontmatterMatch) {
      return yaml.load(frontmatterMatch[1]) as SkillFrontmatter;
    }

    // Fallback: extract name from first heading
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) {
      return { name: headingMatch[1].trim() };
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Scan skills directory and extract skill metadata
 */
function scanSkills(workspacePath: string): OpenClawSkill[] {
  const skillsDir = join(workspacePath, 'skills');

  if (!existsSync(skillsDir)) {
    return [];
  }

  const skills: OpenClawSkill[] = [];

  try {
    const entries = readdirSync(skillsDir, { withFileTypes: true });

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      const skillDir = join(skillsDir, entry.name);
      const skillMeta = readSkillMd(skillDir);

      if (skillMeta) {
        skills.push({
          name: skillMeta.name || entry.name,
          // Version: use frontmatter version, or derive from changelog, or default to "1.0.0"
          version: skillMeta.version || extractVersionFromChangelog(skillMeta.changelog) || '1.0.0',
          description: skillMeta.description,
        });
      } else {
        // Skill directory exists but no SKILL.md - use directory name
        skills.push({
          name: entry.name,
          version: '1.0.0',
        });
      }
    }
  } catch {
    // Skills directory not readable
  }

  return skills;
}

/**
 * Extract version from changelog string
 * Example: "## 2.1.0\n- Added feature" → "2.1.0"
 */
function extractVersionFromChangelog(changelog?: string): string | null {
  if (!changelog) return null;

  const versionMatch = changelog.match(/##?\s*v?(\d+\.\d+\.\d+)/i);
  return versionMatch ? versionMatch[1] : null;
}

// =============================================================================
// CANONICALIZATION (MUST MATCH BACKEND)
// =============================================================================

/**
 * Normalize skill name to canonical form.
 * MUST match backend: src/openclaw/canonical.ts
 */
function normalizeSkillName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-+/g, '-');
}

/**
 * Canonicalize manifest for deterministic hashing.
 * MUST produce identical output to backend.
 */
function canonicalize(manifest: OpenClawManifest): string {
  // Normalize and sort skills
  const normalizedSkills = manifest.skills
    .map(skill => {
      const normalized: OpenClawSkill = {
        name: normalizeSkillName(skill.name),
        version: skill.version.trim().toLowerCase(),
      };
      if (skill.description?.trim()) {
        normalized.description = skill.description.trim();
      }
      return normalized;
    })
    .sort((a, b) => {
      const nameCompare = a.name.localeCompare(b.name);
      if (nameCompare !== 0) return nameCompare;
      return a.version.localeCompare(b.version);
    });

  // Build canonical object with fixed field order (alphabetical)
  const canonical = {
    agent_description: manifest.agent_description.trim(),
    agent_name: manifest.agent_name.trim(),
    agent_role: manifest.agent_role.trim(),
    schema_version: manifest.schema_version,
    skills: normalizedSkills,
  };

  return JSON.stringify(canonical);
}

/**
 * Calculate SHA256 fingerprint from canonical manifest
 */
function calculateFingerprint(canonicalJson: string): string {
  const hash = createHash('sha256').update(canonicalJson).digest('hex');
  return `0x${hash}`;
}

// =============================================================================
// MAIN: EXTRACT MANIFEST FROM OPENCLAW
// =============================================================================

export interface ExtractOptions {
  agentId?: string;  // Specific agent ID to extract (default: "main" or first)
  configPath?: string;
  workspacePath?: string;
}

/**
 * Extract OpenClawManifest from local OpenClaw installation
 */
export function extractManifest(options: ExtractOptions = {}): {
  manifest: OpenClawManifest;
  sources: FingerprintResult['sources'];
} {
  const configPath = options.configPath || getConfigPath();
  const config = readConfig(configPath);

  // Find the target agent
  type AgentEntry = NonNullable<NonNullable<OpenClawConfig['agents']>['list']>[0];
  let targetAgent: AgentEntry | undefined;
  let workspacePath: string;

  if (config?.agents?.list && config.agents.list.length > 0) {
    if (options.agentId) {
      targetAgent = config.agents.list.find(a => a.id === options.agentId);
    } else {
      // Find default agent or use first
      targetAgent = config.agents.list.find(a => a.default) || config.agents.list[0];
    }
  }

  // Determine workspace path
  workspacePath = options.workspacePath
    || targetAgent?.workspace
    || config?.agents?.defaults?.workspace
    || getWorkspacePath();

  // Read identity data
  const identityMd = readIdentityMd(workspacePath);
  const soulMd = readSoulMd(workspacePath);

  // Build agent name (resolution cascade)
  const agentName =
    targetAgent?.identity?.name ||
    targetAgent?.name ||
    identityMd.name ||
    targetAgent?.id ||
    'OpenClaw Agent';

  // Build agent description
  const agentDescription =
    identityMd.description ||
    targetAgent?.identity?.theme ||
    identityMd.theme ||
    'An OpenClaw AI assistant';

  // Build agent role
  const agentRole =
    soulMd.role ||
    targetAgent?.identity?.theme ||
    'AI Assistant';

  // Scan skills
  const skills = scanSkills(workspacePath);

  // Build manifest
  const manifest: OpenClawManifest = {
    schema_version: 'openclaw-manifest-v1',
    agent_name: agentName,
    agent_description: agentDescription,
    agent_role: agentRole,
    skills: skills,
  };

  return {
    manifest,
    sources: {
      config: existsSync(configPath) ? configPath : null,
      workspace: existsSync(workspacePath) ? workspacePath : null,
      skillsDir: existsSync(join(workspacePath, 'skills')) ? join(workspacePath, 'skills') : null,
    },
  };
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Calculate fingerprint for local OpenClaw agent.
 *
 * Usage:
 * ```typescript
 * import { getFingerprint } from '@agentid/openclaw-fingerprint';
 *
 * const result = getFingerprint();
 * console.log(result.fingerprint); // 0x...
 * ```
 */
export function getFingerprint(options: ExtractOptions = {}): FingerprintResult {
  const { manifest, sources } = extractManifest(options);
  const canonical = canonicalize(manifest);
  const fingerprint = calculateFingerprint(canonical);

  return {
    fingerprint,
    schema: manifest.schema_version,
    manifest,
    canonical,
    sources,
  };
}

/**
 * Verify that a local agent matches a registered fingerprint.
 */
export function verifyFingerprint(
  registeredFingerprint: string,
  options: ExtractOptions = {}
): {
  match: boolean;
  computed: string;
  registered: string;
  message: string;
} {
  const result = getFingerprint(options);

  const normalizedRegistered = registeredFingerprint.toLowerCase();
  const match = result.fingerprint === normalizedRegistered;

  return {
    match,
    computed: result.fingerprint,
    registered: normalizedRegistered,
    message: match
      ? 'MATCH: This OpenClaw agent corresponds to the registered Agent ID'
      : 'MISMATCH: Agent configuration has changed or is a different agent',
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export { canonicalize, calculateFingerprint, normalizeSkillName };
