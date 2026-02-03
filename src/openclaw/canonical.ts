/**
 * OpenClaw Agent ID - Canonicalization
 *
 * Deterministic serialization of OpenClaw manifests.
 *
 * Guarantees:
 * - Field order is fixed
 * - Serialization is deterministic
 * - Whitespace is eliminated
 * - Default values are normalized
 * - schema_version is always included
 */

import type { OpenClawManifest, OpenClawSkill } from './types.js';

// =============================================================================
// CANONICALIZATION
// =============================================================================

/**
 * Canonicalize an OpenClaw manifest for deterministic hashing.
 *
 * Rules:
 * 1. Fields are ordered alphabetically at each level
 * 2. No whitespace (compact JSON)
 * 3. Empty/undefined optional fields are omitted
 * 4. Skills are sorted by name, then version
 * 5. Strings are trimmed
 *
 * @param manifest - The manifest to canonicalize
 * @returns Canonical JSON string
 */
export function canonicalize(manifest: OpenClawManifest): string {
  // Validate required fields
  if (!manifest.schema_version) {
    throw new Error('schema_version is required');
  }
  if (manifest.schema_version !== 'openclaw-manifest-v1') {
    throw new Error(`Unsupported schema version: ${manifest.schema_version}`);
  }
  if (!manifest.agent_name || typeof manifest.agent_name !== 'string') {
    throw new Error('agent_name is required and must be a string');
  }
  if (!manifest.agent_description || typeof manifest.agent_description !== 'string') {
    throw new Error('agent_description is required and must be a string');
  }
  if (!manifest.agent_role || typeof manifest.agent_role !== 'string') {
    throw new Error('agent_role is required and must be a string');
  }
  if (!Array.isArray(manifest.skills)) {
    throw new Error('skills is required and must be an array');
  }

  // Normalize and sort skills
  const normalizedSkills = manifest.skills
    .map(normalizeSkill)
    .sort(compareSkills);

  // Build canonical object with fixed field order (alphabetical)
  const canonical = {
    agent_description: manifest.agent_description.trim(),
    agent_name: manifest.agent_name.trim(),
    agent_role: manifest.agent_role.trim(),
    schema_version: manifest.schema_version,
    skills: normalizedSkills,
  };

  // Serialize without whitespace
  return JSON.stringify(canonical);
}

/**
 * Normalize a skill name to canonical form.
 *
 * Rules:
 * - Lowercase
 * - Trim whitespace
 * - Replace non-ASCII and special chars with hyphen
 * - Collapse multiple hyphens
 * - Remove leading/trailing hyphens
 *
 * Examples:
 * - "Search" → "search"
 * - "Web Search" → "web-search"
 * - "web_search" → "web-search"
 * - "  Chat Bot  " → "chat-bot"
 */
export function normalizeSkillName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')  // Replace non-alphanumeric with hyphen
    .replace(/^-+|-+$/g, '')       // Remove leading/trailing hyphens
    .replace(/-+/g, '-');          // Collapse multiple hyphens
}

/**
 * Normalize a skill object
 */
function normalizeSkill(skill: OpenClawSkill): OpenClawSkill {
  if (!skill.name || typeof skill.name !== 'string') {
    throw new Error('Skill name is required');
  }
  if (!skill.version || typeof skill.version !== 'string') {
    throw new Error('Skill version is required');
  }

  const normalized: OpenClawSkill = {
    name: normalizeSkillName(skill.name),
    version: skill.version.trim().toLowerCase(),
  };

  // Only include description if it's a non-empty string
  if (skill.description && typeof skill.description === 'string' && skill.description.trim()) {
    normalized.description = skill.description.trim();
  }

  return normalized;
}

/**
 * Compare skills for sorting (by name, then version)
 */
function compareSkills(a: OpenClawSkill, b: OpenClawSkill): number {
  const nameCompare = a.name.localeCompare(b.name);
  if (nameCompare !== 0) return nameCompare;
  return a.version.localeCompare(b.version);
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate a manifest without canonicalizing
 *
 * @param manifest - Object to validate
 * @returns Validation result
 */
export function validateManifest(manifest: unknown): {
  valid: boolean;
  errors: string[];
} {
  const errors: string[] = [];

  if (!manifest || typeof manifest !== 'object') {
    return { valid: false, errors: ['Manifest must be an object'] };
  }

  const m = manifest as Record<string, unknown>;

  // Required fields
  if (m.schema_version !== 'openclaw-manifest-v1') {
    errors.push('schema_version must be "openclaw-manifest-v1"');
  }
  if (!m.agent_name || typeof m.agent_name !== 'string') {
    errors.push('agent_name is required and must be a string');
  }
  if (!m.agent_description || typeof m.agent_description !== 'string') {
    errors.push('agent_description is required and must be a string');
  }
  if (!m.agent_role || typeof m.agent_role !== 'string') {
    errors.push('agent_role is required and must be a string');
  }

  // Skills validation
  if (!Array.isArray(m.skills)) {
    errors.push('skills is required and must be an array');
  } else {
    m.skills.forEach((skill, index) => {
      if (!skill || typeof skill !== 'object') {
        errors.push(`skills[${index}] must be an object`);
        return;
      }
      const s = skill as Record<string, unknown>;
      if (!s.name || typeof s.name !== 'string') {
        errors.push(`skills[${index}].name is required and must be a string`);
      }
      if (!s.version || typeof s.version !== 'string') {
        errors.push(`skills[${index}].version is required and must be a string`);
      }
    });
  }

  return { valid: errors.length === 0, errors };
}
