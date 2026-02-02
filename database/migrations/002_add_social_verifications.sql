-- =============================================================================
-- MIGRATION: Add Social Verifications Table
-- =============================================================================
-- Stores Twitter and other social platform verifications for agents
-- =============================================================================

-- Social verifications table
CREATE TABLE IF NOT EXISTS social_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identity_hash VARCHAR(66) NOT NULL,

    -- Platform info
    platform VARCHAR(50) NOT NULL CHECK (platform IN ('twitter', 'github', 'discord', 'telegram', 'domain')),
    platform_user_id VARCHAR(255) NOT NULL,
    platform_username VARCHAR(255) NOT NULL,

    -- Verification proof
    challenge_code VARCHAR(100) NOT NULL,
    proof_url VARCHAR(1000),
    proof_id VARCHAR(255), -- tweet ID, commit ID, etc.

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'verified' CHECK (status IN ('pending', 'verified', 'expired', 'revoked')),

    -- Timestamps
    verified_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,

    -- Metadata
    metadata JSONB DEFAULT '{}',

    -- Constraints
    CONSTRAINT unique_verification_per_platform UNIQUE (identity_hash, platform)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_social_verifications_hash ON social_verifications(identity_hash);
CREATE INDEX IF NOT EXISTS idx_social_verifications_platform ON social_verifications(platform);
CREATE INDEX IF NOT EXISTS idx_social_verifications_username ON social_verifications(platform, platform_username);
CREATE INDEX IF NOT EXISTS idx_social_verifications_status ON social_verifications(status);

-- Comments
COMMENT ON TABLE social_verifications IS 'Stores social platform verifications (Twitter, GitHub, etc.) for agent identities';
COMMENT ON COLUMN social_verifications.identity_hash IS 'The agent identity hash this verification belongs to';
COMMENT ON COLUMN social_verifications.proof_url IS 'URL to the verification proof (tweet, commit, etc.)';
COMMENT ON COLUMN social_verifications.proof_id IS 'Platform-specific ID of the proof (tweet ID, commit SHA, etc.)';
