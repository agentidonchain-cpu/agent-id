-- =============================================================================
-- MIGRATION 003: ON-CHAIN FIRST ENFORCEMENT
-- =============================================================================
-- This migration enforces the rule: "Registered" = on-chain TX mined.
-- Agents without block_number are drafts, not registered agents.
-- =============================================================================

-- Add missing blockchain columns
ALTER TABLE agent_identities
ADD COLUMN IF NOT EXISTS chain_id INTEGER,
ADD COLUMN IF NOT EXISTS registry_address VARCHAR(42);

-- Update existing blockchain_chain to chain_id where possible
UPDATE agent_identities
SET chain_id = CASE
    WHEN blockchain_chain = 'base' THEN 8453
    WHEN blockchain_chain = 'base-sepolia' THEN 84532
    WHEN blockchain_chain = 'ethereum' THEN 1
    ELSE NULL
END
WHERE blockchain_chain IS NOT NULL AND chain_id IS NULL;

-- Set default registry address for Base mainnet
UPDATE agent_identities
SET registry_address = '0x471C4c43672be2d49A2ceC79203c23b7194A22Fa'
WHERE chain_id = 8453 AND registry_address IS NULL AND blockchain_tx_hash IS NOT NULL;

-- =============================================================================
-- NEW STATUS ENUM: Replace ambiguous statuses
-- =============================================================================
-- Old: pending, validating, validated, suspended, revoked, archived
-- New: draft, tx_submitted, registered, suspended, revoked
--
-- "validated" without on-chain = "draft"
-- "validated" with on-chain = "registered"
-- =============================================================================

-- Create new status type
DO $$
BEGIN
    -- Check if old status values exist and migrate them
    UPDATE agent_identities
    SET status = 'draft'
    WHERE status IN ('pending', 'validating')
    AND blockchain_block_number IS NULL;

    UPDATE agent_identities
    SET status = 'draft'
    WHERE status = 'validated'
    AND blockchain_block_number IS NULL;

    UPDATE agent_identities
    SET status = 'registered'
    WHERE status = 'validated'
    AND blockchain_block_number IS NOT NULL;

    -- Keep suspended, revoked, archived as-is
END $$;

-- =============================================================================
-- CONSTRAINT: Registered requires block_number
-- =============================================================================

-- Add constraint that "registered" status requires blockchain proof
ALTER TABLE agent_identities
DROP CONSTRAINT IF EXISTS registered_requires_onchain;

ALTER TABLE agent_identities
ADD CONSTRAINT registered_requires_onchain CHECK (
    status != 'registered' OR blockchain_block_number IS NOT NULL
);

-- =============================================================================
-- INDEX: Fast lookup of on-chain registered agents
-- =============================================================================

DROP INDEX IF EXISTS idx_identities_registered_onchain;
CREATE INDEX idx_identities_registered_onchain
ON agent_identities(identity_hash)
WHERE status = 'registered' AND blockchain_block_number IS NOT NULL;

-- Unique constraint for on-chain registrations per chain
DROP INDEX IF EXISTS idx_identities_chain_unique;
CREATE UNIQUE INDEX idx_identities_chain_unique
ON agent_identities(identity_hash, chain_id, registry_address)
WHERE blockchain_block_number IS NOT NULL;

-- =============================================================================
-- VIEW: Only truly registered agents (on-chain)
-- =============================================================================

DROP VIEW IF EXISTS registered_agents;
CREATE VIEW registered_agents AS
SELECT
    ai.id,
    ai.identity_hash,
    ai.creator_id,
    ai.status,
    ai.blockchain_chain,
    ai.blockchain_tx_hash,
    ai.blockchain_block_number,
    ai.blockchain_anchored_at,
    ai.chain_id,
    ai.registry_address,
    ai.created_at,
    am.display_name,
    am.avatar_url,
    am.bio
FROM agent_identities ai
LEFT JOIN agent_metadata am ON am.agent_id = ai.id
WHERE ai.status = 'registered'
AND ai.blockchain_block_number IS NOT NULL;

-- =============================================================================
-- VIEW: Draft agents (off-chain only)
-- =============================================================================

DROP VIEW IF EXISTS draft_agents;
CREATE VIEW draft_agents AS
SELECT
    ai.id,
    ai.identity_hash,
    ai.creator_id,
    ai.status,
    ai.created_at,
    am.display_name,
    am.avatar_url,
    am.bio
FROM agent_identities ai
LEFT JOIN agent_metadata am ON am.agent_id = ai.id
WHERE ai.blockchain_block_number IS NULL
AND ai.status NOT IN ('revoked', 'suspended');

-- =============================================================================
-- FUNCTION: Check if agent is truly registered
-- =============================================================================

CREATE OR REPLACE FUNCTION is_agent_registered(p_identity_hash VARCHAR(64))
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM agent_identities
        WHERE identity_hash = p_identity_hash
        AND status = 'registered'
        AND blockchain_block_number IS NOT NULL
    );
END;
$$ LANGUAGE plpgsql STABLE;

-- =============================================================================
-- TRIGGER: Prevent setting status to 'registered' without block_number
-- =============================================================================

CREATE OR REPLACE FUNCTION enforce_onchain_registration()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status = 'registered' AND NEW.blockchain_block_number IS NULL THEN
        RAISE EXCEPTION 'Cannot set status to registered without blockchain_block_number. Use draft status for off-chain agents.';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_enforce_onchain_registration ON agent_identities;
CREATE TRIGGER trigger_enforce_onchain_registration
BEFORE INSERT OR UPDATE ON agent_identities
FOR EACH ROW
EXECUTE FUNCTION enforce_onchain_registration();

-- =============================================================================
-- MIGRATION COMPLETE
-- =============================================================================
-- After this migration:
-- 1. status='registered' is IMPOSSIBLE without blockchain_block_number
-- 2. Old 'validated' without on-chain are now 'draft'
-- 3. Views separate registered (on-chain) from drafts (off-chain)
-- 4. Trigger prevents future violations
-- =============================================================================
