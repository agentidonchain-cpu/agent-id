# @agentid/openclaw-fingerprint

OpenClaw plugin for calculating deterministic Agent ID fingerprints.

## What This Is

A **local, offline, deterministic** tool that calculates the identity fingerprint of your OpenClaw agent.

```
fingerprint = SHA256(canonical_manifest)
```

## What This Is NOT

- ❌ Does NOT call external APIs
- ❌ Does NOT register the agent
- ❌ Does NOT require wallet
- ❌ Does NOT require authentication
- ❌ Does NOT modify any files

## Installation

```bash
npm install -g @agentid/openclaw-fingerprint
```

## Usage

### CLI

```bash
# Calculate fingerprint
openclaw-fingerprint

# JSON output (includes canonical manifest)
openclaw-fingerprint --json

# Verify against registered fingerprint
openclaw-fingerprint --verify 0xabc123...

# Specific agent
openclaw-fingerprint --agent work

# Custom paths
openclaw-fingerprint --config /path/to/openclaw.json --workspace /path/to/workspace
```

### Programmatic

```typescript
import { getFingerprint, verifyFingerprint } from '@agentid/openclaw-fingerprint';

// Calculate fingerprint
const result = getFingerprint();
console.log(result.fingerprint);  // 0x...

// Verify against registered
const verification = verifyFingerprint('0xabc123...');
console.log(verification.match);  // true/false
```

## OpenClaw Compatibility

### Supported Structure (as of Feb 2026)

This plugin reads from the standard OpenClaw layout:

```
~/.openclaw/
├── openclaw.json                    # Agent configuration
└── workspace/
    ├── IDENTITY.md                  # Agent name, description
    ├── SOUL.md                      # Agent role/purpose
    └── skills/
        └── <skill-name>/
            └── SKILL.md             # Skill metadata
```

### Data Extraction

| Field | Source | Fallback |
|-------|--------|----------|
| `agent_name` | `identity.name` in config → `IDENTITY.md` frontmatter → `agents.list[].id` | "OpenClaw Agent" |
| `agent_description` | `IDENTITY.md` description → `identity.theme` | "An OpenClaw AI assistant" |
| `agent_role` | `SOUL.md` role/purpose → `identity.theme` | "AI Assistant" |
| `skills[].name` | `SKILL.md` frontmatter → directory name | - |
| `skills[].version` | `SKILL.md` version → changelog parse | "1.0.0" |

### ⚠️ Important: Schema Ownership

- The `OpenClawManifest` schema is **defined by AgentID**, not OpenClaw
- This plugin is compatible with **OpenClaw v2026.x** structure
- If OpenClaw changes its internal layout, fingerprints will change
- This is expected and acceptable - the fingerprint reflects the **current** agent state

## Manifest Schema

```typescript
interface OpenClawManifest {
  schema_version: 'openclaw-manifest-v1';
  agent_name: string;
  agent_description: string;
  agent_role: string;
  skills: {
    name: string;      // normalized: lowercase, hyphens
    version: string;   // normalized: lowercase
    description?: string;
  }[];
}
```

## Canonicalization Rules

To ensure deterministic fingerprints:

1. Fields ordered alphabetically
2. Skills sorted by `name`, then `version`
3. Skill names normalized: lowercase, trim, non-alphanumeric → hyphen
4. All strings trimmed
5. Empty optional fields omitted
6. Compact JSON (no whitespace)

## Registration vs Anchoring

```
┌─────────────────────────────────────────────────────────────────┐
│  LOCAL                         │  AGENTID BACKEND              │
├────────────────────────────────┼───────────────────────────────┤
│  openclaw-fingerprint          │                               │
│  → 0xabc123...                 │                               │
│                                │                               │
│  POST /api/v1/openclaw/register│  → Stored in database         │
│                                │  → fingerprint = REGISTERED   │
│                                │                               │
│  POST /api/v1/blockchain/anchor│  → Stored on Base blockchain  │
│  (separate, optional)          │  → fingerprint = ANCHORED     │
└────────────────────────────────┴───────────────────────────────┘
```

**Important distinction:**
- `registered` = stored in AgentID database (free, instant)
- `anchored` = stored on Base blockchain (requires gas, permanent)

Both use the same fingerprint. Anchoring is optional.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `OPENCLAW_CONFIG_PATH` | Override config file location |
| `OPENCLAW_WORKSPACE` | Override workspace location |

## License

MIT
