-- =============================================================================
-- MIGRATION 001: Add agentId, Versioning, and Roles
-- =============================================================================
-- This migration adds:
-- 1. Stable agent identifier (agent_id) separate from identity_hash
-- 2. Version tracking (version_number, previous_version)
-- 3. Role separation (owner_address, operator_address)
-- 4. Tool dependency tracking
-- 5. Version history table
--
-- All changes are backwards compatible (new columns are nullable or have defaults)
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Add new columns to agent_identities
-- =============================================================================

-- Stable agent identifier (generated first, before identity_hash)
-- Model: agentId exists before any identity version, not derived from hash
ALTER TABLE agent_identities
ADD COLUMN IF NOT EXISTS agent_id UUID DEFAULT uuid_generate_v4();

-- Version tracking
-- version_number: 1-based, linear, monotonic (max 65535 matches uint16 on-chain)
-- No silent rollback - to revert, create new version pointing to old hash
ALTER TABLE agent_identities
ADD COLUMN IF NOT EXISTS previous_version VARCHAR(64);

ALTER TABLE agent_identities
ADD COLUMN IF NOT EXISTS version_number INTEGER DEFAULT 1
    CHECK (version_number >= 1 AND version_number <= 65535);

-- Role separation: owner can transfer, operator can act but not transfer
ALTER TABLE agent_identities
ADD COLUMN IF NOT EXISTS owner_address VARCHAR(42);

ALTER TABLE agent_identities
ADD COLUMN IF NOT EXISTS operator_address VARCHAR(42);

-- =============================================================================
-- 2. Create version history table
-- =============================================================================

CREATE TABLE IF NOT EXISTS agent_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- Links to the stable agent identifier
    agent_id UUID NOT NULL,

    -- Identity hash for this specific version
    identity_hash VARCHAR(64) NOT NULL,

    -- Version tracking
    version_number INTEGER NOT NULL CHECK (version_number >= 1 AND version_number <= 65535),
    previous_version VARCHAR(64),

    -- Metadata
    change_summary TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    -- Constraints
    CONSTRAINT unique_agent_version UNIQUE (agent_id, version_number),
    CONSTRAINT unique_agent_hash UNIQUE (agent_id, identity_hash)
);

CREATE INDEX IF NOT EXISTS idx_versions_agent_id ON agent_versions(agent_id);
CREATE INDEX IF NOT EXISTS idx_versions_identity_hash ON agent_versions(identity_hash);
CREATE INDEX IF NOT EXISTS idx_versions_agent_version ON agent_versions(agent_id, version_number DESC);

COMMENT ON TABLE agent_versions IS 'Version history for agents. Tracks all identity_hash versions for each agent_id.';
COMMENT ON COLUMN agent_versions.version_number IS 'Linear, monotonic version number (1-65535). No rollback - revert by creating new version.';

-- =============================================================================
-- 3. Add tool dependency tracking to agent_tools
-- =============================================================================

-- Dependency type: critical tools affect identity hash, utility tools do not
ALTER TABLE agent_tools
ADD COLUMN IF NOT EXISTS dependency_type VARCHAR(20) DEFAULT 'utility'
    CHECK (dependency_type IN ('critical', 'utility'));

-- If the tool is an agent, store its identity hash (included in parent's hash if critical)
ALTER TABLE agent_tools
ADD COLUMN IF NOT EXISTS agent_identity_hash VARCHAR(64);

-- =============================================================================
-- 4. Create indexes for new columns
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_identities_agent_id ON agent_identities(agent_id);
CREATE INDEX IF NOT EXISTS idx_identities_version ON agent_identities(agent_id, version_number DESC);
CREATE INDEX IF NOT EXISTS idx_identities_previous ON agent_identities(previous_version)
    WHERE previous_version IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_identities_owner ON agent_identities(owner_address)
    WHERE owner_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tools_critical ON agent_tools(agent_id, dependency_type)
    WHERE dependency_type = 'critical';
CREATE INDEX IF NOT EXISTS idx_tools_agent_hash ON agent_tools(agent_identity_hash)
    WHERE agent_identity_hash IS NOT NULL;

-- =============================================================================
-- 5. Migrate existing data
-- =============================================================================

-- For existing records without agent_id, generate a new UUID v4
-- Note: agent_id is generated first, not derived from identity_hash
UPDATE agent_identities
SET agent_id = uuid_generate_v4()
WHERE agent_id IS NULL;

-- Set version_number = 1 for all existing records (they are first versions)
UPDATE agent_identities
SET version_number = 1
WHERE version_number IS NULL;

-- Set owner_address from creator's wallet_address if available
UPDATE agent_identities ai
SET owner_address = c.wallet_address
FROM creators c
WHERE ai.creator_id = c.id
  AND ai.owner_address IS NULL
  AND c.wallet_address IS NOT NULL;

-- Insert existing identities into version history
INSERT INTO agent_versions (agent_id, identity_hash, version_number, previous_version, created_at)
SELECT agent_id, identity_hash, version_number, previous_version, created_at
FROM agent_identities
WHERE agent_id IS NOT NULL
ON CONFLICT (agent_id, identity_hash) DO NOTHING;

-- =============================================================================
-- 6. Add NOT NULL constraint to agent_id after migration
-- =============================================================================

ALTER TABLE agent_identities
ALTER COLUMN agent_id SET NOT NULL;

-- =============================================================================
-- 7. Add comments
-- =============================================================================

COMMENT ON COLUMN agent_identities.agent_id IS 'Stable UUID identifier for the agent. Persists across versions. Generated first (v4), not derived from hash.';
COMMENT ON COLUMN agent_identities.previous_version IS 'Identity hash of the previous version (null for first version).';
COMMENT ON COLUMN agent_identities.version_number IS 'Linear version number (1-65535). Monotonic, no silent rollback allowed.';
COMMENT ON COLUMN agent_identities.owner_address IS 'Current owner wallet address. Can transfer ownership.';
COMMENT ON COLUMN agent_identities.operator_address IS 'Operator wallet address. Can act on behalf of owner but cannot transfer.';
COMMENT ON COLUMN agent_tools.dependency_type IS 'Tool dependency type: critical (affects hash) or utility (does not affect hash).';
COMMENT ON COLUMN agent_tools.agent_identity_hash IS 'If this tool is an agent, its identity hash (included in parent hash if critical).';

COMMIT;
