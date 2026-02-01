-- =============================================================================
-- AGENT007 - DATABASE SCHEMA
-- =============================================================================
-- PostgreSQL schema for the Agent007 system.
-- This schema implements immutable identity storage with full audit trail.
-- License to Verify - Immutable Identity for AI Agents
-- =============================================================================

-- Enable necessary extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- CREATORS (Human owners of agents)
-- =============================================================================

CREATE TABLE creators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    email_hash VARCHAR(64) NOT NULL, -- For lookups without exposing email
    display_name VARCHAR(100) NOT NULL,
    wallet_address VARCHAR(42), -- Ethereum address for blockchain operations

    -- Security
    password_hash VARCHAR(255), -- bcrypt hash
    mfa_secret_encrypted BYTEA,
    mfa_enabled BOOLEAN DEFAULT FALSE,
    email_verified BOOLEAN DEFAULT FALSE,
    email_verified_at TIMESTAMPTZ,

    -- API access
    api_key_hash VARCHAR(64) UNIQUE,
    api_key_prefix VARCHAR(12), -- First 12 chars for identification
    api_key_created_at TIMESTAMPTZ,

    -- Status
    is_active BOOLEAN DEFAULT TRUE,
    suspended_at TIMESTAMPTZ,
    suspended_reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_creators_email_hash ON creators(email_hash);
CREATE INDEX idx_creators_api_key_prefix ON creators(api_key_prefix);
CREATE INDEX idx_creators_wallet ON creators(wallet_address) WHERE wallet_address IS NOT NULL;

-- =============================================================================
-- AGENT IDENTITIES (Main identity table)
-- =============================================================================

CREATE TABLE agent_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identity_hash VARCHAR(64) UNIQUE NOT NULL, -- Merkle root
    creator_id UUID NOT NULL REFERENCES creators(id) ON DELETE RESTRICT,

    -- Status
    status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'validating', 'validated', 'suspended', 'revoked', 'archived')),
    status_reason TEXT,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    validated_at TIMESTAMPTZ,
    suspended_at TIMESTAMPTZ,
    revoked_at TIMESTAMPTZ,
    archived_at TIMESTAMPTZ,
    last_verified_at TIMESTAMPTZ,

    -- Blockchain anchor (optional)
    blockchain_chain VARCHAR(20),
    blockchain_tx_hash VARCHAR(66),
    blockchain_block_number BIGINT,
    blockchain_anchored_at TIMESTAMPTZ,

    -- Constraints
    CONSTRAINT valid_blockchain CHECK (
        (blockchain_chain IS NULL AND blockchain_tx_hash IS NULL) OR
        (blockchain_chain IS NOT NULL AND blockchain_tx_hash IS NOT NULL)
    )
);

CREATE INDEX idx_identities_creator ON agent_identities(creator_id);
CREATE INDEX idx_identities_status ON agent_identities(status);
CREATE INDEX idx_identities_hash ON agent_identities(identity_hash);
CREATE INDEX idx_identities_validated ON agent_identities(validated_at) WHERE status = 'validated';

-- =============================================================================
-- AGENT CORE CONFIGS (Immutable after validation)
-- =============================================================================

CREATE TABLE agent_core_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,

    -- System prompt (encrypted at rest)
    system_prompt_hash VARCHAR(64) NOT NULL,
    system_prompt_encrypted BYTEA NOT NULL,
    system_prompt_version VARCHAR(10) NOT NULL DEFAULT '1.0',
    encryption_key_id VARCHAR(64) NOT NULL,

    -- Model configuration
    model_provider VARCHAR(20) NOT NULL,
    model_id VARCHAR(100) NOT NULL,
    model_version VARCHAR(50),
    api_endpoint VARCHAR(500) NOT NULL,
    api_key_hash VARCHAR(64) NOT NULL, -- Hash of the API key
    auth_method VARCHAR(20) NOT NULL DEFAULT 'bearer',

    -- Generation parameters (stored as JSONB)
    parameters JSONB NOT NULL,

    -- Component hashes for Merkle verification
    model_config_hash VARCHAR(64) NOT NULL,
    parameters_hash VARCHAR(64) NOT NULL,
    tools_hash VARCHAR(64) NOT NULL,
    knowledge_base_hash VARCHAR(64) NOT NULL,

    -- Sealing
    sealed_at TIMESTAMPTZ, -- Once sealed, no modifications allowed
    sealed_by VARCHAR(100), -- System or admin ID

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT one_config_per_agent UNIQUE (agent_id)
);

CREATE INDEX idx_core_configs_agent ON agent_core_configs(agent_id);
CREATE INDEX idx_core_configs_provider ON agent_core_configs(model_provider);

-- =============================================================================
-- AGENT TOOLS (Functions/tools available to the agent)
-- =============================================================================

CREATE TABLE agent_tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,

    -- Tool definition
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    description_hash VARCHAR(64) NOT NULL,
    parameters_schema JSONB NOT NULL,
    parameters_schema_hash VARCHAR(64) NOT NULL,

    -- Combined hash for this tool
    tool_hash VARCHAR(64) NOT NULL,

    -- Order in the tools array
    position INTEGER NOT NULL,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_tool_per_agent UNIQUE (agent_id, name)
);

CREATE INDEX idx_tools_agent ON agent_tools(agent_id);

-- =============================================================================
-- AGENT KNOWLEDGE BASE (Documents/RAG content)
-- =============================================================================

CREATE TABLE agent_knowledge_documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,

    -- Document metadata
    name VARCHAR(255) NOT NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,

    -- Content (encrypted storage reference)
    content_hash VARCHAR(64) NOT NULL,
    storage_ref VARCHAR(500), -- S3/MinIO/IPFS reference
    storage_encrypted BOOLEAN DEFAULT TRUE,

    -- Timestamps
    added_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT unique_doc_per_agent UNIQUE (agent_id, content_hash)
);

CREATE INDEX idx_knowledge_agent ON agent_knowledge_documents(agent_id);

-- =============================================================================
-- AGENT METADATA (Mutable - display info)
-- =============================================================================

CREATE TABLE agent_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,

    -- Display information
    display_name VARCHAR(100) NOT NULL,
    avatar_url VARCHAR(500),
    bio TEXT,
    tags TEXT[] DEFAULT '{}',

    -- Social links
    social_twitter VARCHAR(100),
    social_github VARCHAR(100),
    social_website VARCHAR(500),

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    CONSTRAINT one_metadata_per_agent UNIQUE (agent_id)
);

CREATE INDEX idx_metadata_agent ON agent_metadata(agent_id);
CREATE INDEX idx_metadata_tags ON agent_metadata USING GIN(tags);

-- =============================================================================
-- VALIDATION CHALLENGES
-- =============================================================================

CREATE TABLE validation_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_id UUID NOT NULL,
    agent_id UUID REFERENCES agent_identities(id) ON DELETE SET NULL,

    -- Challenge data (encrypted)
    challenge_prompts_encrypted BYTEA NOT NULL,
    challenge_type VARCHAR(50) NOT NULL DEFAULT 'standard',

    -- Timing
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,

    -- Status
    status VARCHAR(20) DEFAULT 'pending'
        CHECK (status IN ('pending', 'in_progress', 'completed', 'failed', 'expired')),

    -- Response data
    response_received_at TIMESTAMPTZ,
    response_content_hash VARCHAR(64),
    response_latency_ms INTEGER,
    response_metadata JSONB,

    -- Validation results
    validation_passed BOOLEAN,
    validation_score DECIMAL(5,4),
    validation_details JSONB,
    validated_at TIMESTAMPTZ
);

CREATE INDEX idx_challenges_registration ON validation_challenges(registration_id);
CREATE INDEX idx_challenges_agent ON validation_challenges(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_challenges_expires ON validation_challenges(expires_at) WHERE status = 'pending';
CREATE INDEX idx_challenges_status ON validation_challenges(status);

-- =============================================================================
-- ATTESTATIONS
-- =============================================================================

CREATE TABLE attestations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    attestation_id VARCHAR(64) UNIQUE NOT NULL,
    agent_id UUID NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,

    -- Attestation type
    type VARCHAR(30) NOT NULL
        CHECK (type IN ('provider_native', 'proxy_verified', 'self_declared',
                        'behavioral', 'identity_validation')),
    trust_level VARCHAR(10) NOT NULL
        CHECK (trust_level IN ('high', 'medium', 'low')),

    -- Attestation content
    payload JSONB NOT NULL,
    signature BYTEA NOT NULL,
    signature_algorithm VARCHAR(20) NOT NULL DEFAULT 'ed25519',

    -- Issuer
    issuer_name VARCHAR(100) NOT NULL,
    issuer_public_key VARCHAR(500) NOT NULL,

    -- Validity
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ NOT NULL,
    revoked_at TIMESTAMPTZ,
    revocation_reason TEXT,

    -- Metadata
    nonce VARCHAR(64) NOT NULL,
    request_id VARCHAR(64)
);

CREATE INDEX idx_attestations_agent ON attestations(agent_id);
CREATE INDEX idx_attestations_type ON attestations(type);
CREATE INDEX idx_attestations_valid ON attestations(valid_until) WHERE revoked_at IS NULL;
CREATE INDEX idx_attestations_issuer ON attestations(issuer_name);

-- =============================================================================
-- BEHAVIORAL FINGERPRINTS
-- =============================================================================

CREATE TABLE behavioral_fingerprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,

    -- Latency statistics
    latency_mean DECIMAL(10,2) NOT NULL,
    latency_std_dev DECIMAL(10,2) NOT NULL,
    latency_p50 DECIMAL(10,2) NOT NULL,
    latency_p95 DECIMAL(10,2) NOT NULL,
    latency_p99 DECIMAL(10,2) NOT NULL,

    -- Vocabulary analysis
    unique_word_count INTEGER,
    avg_sentence_length DECIMAL(6,2),
    readability_score DECIMAL(5,2),
    type_token_ratio DECIMAL(5,4),
    top_ngrams JSONB,

    -- Style markers
    emoji_usage DECIMAL(5,4),
    punctuation_pattern VARCHAR(100),
    capitalization_style VARCHAR(20),
    formatting_preferences TEXT[],
    avg_paragraph_length DECIMAL(6,2),

    -- Topic vector (for similarity)
    topic_vector REAL[],

    -- Scores
    consistency_score DECIMAL(5,4) NOT NULL,
    sample_size INTEGER NOT NULL,

    -- Baseline flag
    is_baseline BOOLEAN DEFAULT FALSE,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_fingerprints_agent ON behavioral_fingerprints(agent_id);
CREATE INDEX idx_fingerprints_baseline ON behavioral_fingerprints(agent_id, is_baseline)
    WHERE is_baseline = TRUE;

-- =============================================================================
-- AUTONOMY ANALYSES
-- =============================================================================

CREATE TABLE autonomy_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,

    -- Scores
    autonomy_score DECIMAL(5,4) NOT NULL,
    confidence DECIMAL(5,4) NOT NULL,
    classification VARCHAR(30) NOT NULL
        CHECK (classification IN ('fully_autonomous', 'supervised',
                                   'hybrid_suspicious', 'human_controlled')),

    -- Individual scores
    timing_score DECIMAL(5,4) NOT NULL,
    language_score DECIMAL(5,4) NOT NULL,
    behavior_score DECIMAL(5,4) NOT NULL,

    -- Detected patterns
    patterns JSONB DEFAULT '[]',

    -- Alerts
    alerts JSONB DEFAULT '[]',

    -- Analysis period
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    messages_analyzed INTEGER NOT NULL,

    -- Timestamp
    analyzed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_autonomy_agent ON autonomy_analyses(agent_id);
CREATE INDEX idx_autonomy_date ON autonomy_analyses(analyzed_at DESC);
CREATE INDEX idx_autonomy_classification ON autonomy_analyses(classification);

-- =============================================================================
-- VERIFICATION RESULTS
-- =============================================================================

CREATE TABLE verification_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
    identity_hash VARCHAR(64) NOT NULL,

    -- Result
    passed BOOLEAN NOT NULL,
    overall_score DECIMAL(5,4) NOT NULL,

    -- Check details
    checks JSONB NOT NULL DEFAULT '[]',
    alerts JSONB NOT NULL DEFAULT '[]',

    -- Timing
    verified_at TIMESTAMPTZ NOT NULL,
    duration_ms INTEGER NOT NULL,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_verification_agent ON verification_results(agent_id);
CREATE INDEX idx_verification_hash ON verification_results(identity_hash);
CREATE INDEX idx_verification_date ON verification_results(verified_at DESC);
CREATE INDEX idx_verification_passed ON verification_results(passed);

-- =============================================================================
-- ALERTS
-- =============================================================================

CREATE TABLE alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,

    -- Alert details
    alert_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    triggered_by VARCHAR(50) NOT NULL,
    data JSONB DEFAULT '{}',

    -- Acknowledgment
    acknowledged BOOLEAN DEFAULT FALSE,
    acknowledged_at TIMESTAMPTZ,
    acknowledged_by VARCHAR(100),

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_alerts_agent ON alerts(agent_id);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_unacknowledged ON alerts(agent_id) WHERE acknowledged = FALSE;
CREATE INDEX idx_alerts_date ON alerts(created_at DESC);

-- =============================================================================
-- IDENTITY VIOLATIONS
-- =============================================================================

CREATE TABLE identity_violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,

    -- Violation details
    violation_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),

    -- What changed
    component_affected VARCHAR(50),
    original_hash VARCHAR(64),
    detected_hash VARCHAR(64),
    changes_detail JSONB,

    -- Action taken
    action_taken VARCHAR(50),
    action_taken_at TIMESTAMPTZ,
    action_taken_by VARCHAR(100),

    -- Resolution
    resolved_at TIMESTAMPTZ,
    resolution_notes TEXT,

    -- Timestamp
    detected_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_violations_agent ON identity_violations(agent_id);
CREATE INDEX idx_violations_unresolved ON identity_violations(agent_id)
    WHERE resolved_at IS NULL;
CREATE INDEX idx_violations_severity ON identity_violations(severity);

-- =============================================================================
-- AUDIT LOG
-- =============================================================================

CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),

    -- What was affected
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID NOT NULL,

    -- What happened
    action VARCHAR(50) NOT NULL,
    action_category VARCHAR(30),

    -- Who did it
    actor_type VARCHAR(20) NOT NULL CHECK (actor_type IN ('system', 'creator', 'admin', 'agent')),
    actor_id UUID,
    actor_ip INET,
    actor_user_agent TEXT,

    -- Details
    old_values JSONB,
    new_values JSONB,
    metadata JSONB,

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_action ON audit_log(action);
CREATE INDEX idx_audit_actor ON audit_log(actor_type, actor_id);
CREATE INDEX idx_audit_date ON audit_log(created_at DESC);

-- Partition by month for large-scale deployments
-- CREATE TABLE audit_log_y2026m01 PARTITION OF audit_log
--     FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');

-- =============================================================================
-- PROXY LOGS (For attestation tracking)
-- =============================================================================

CREATE TABLE proxy_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    request_id VARCHAR(64) UNIQUE NOT NULL,
    agent_id UUID REFERENCES agent_identities(id) ON DELETE SET NULL,

    -- Timing (microseconds for precision)
    request_received_at BIGINT NOT NULL,
    request_forwarded_at BIGINT NOT NULL,
    response_received_at BIGINT NOT NULL,
    response_sent_at BIGINT NOT NULL,

    -- Integrity hashes
    original_request_hash VARCHAR(64) NOT NULL,
    forwarded_request_hash VARCHAR(64) NOT NULL,
    received_response_hash VARCHAR(64) NOT NULL,
    sent_response_hash VARCHAR(64) NOT NULL,

    -- Request details
    model_provider VARCHAR(20),
    model_id VARCHAR(100),
    tokens_input INTEGER,
    tokens_output INTEGER,

    -- Attestation generated
    attestation_id UUID REFERENCES attestations(id),

    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_proxy_agent ON proxy_logs(agent_id) WHERE agent_id IS NOT NULL;
CREATE INDEX idx_proxy_request ON proxy_logs(request_id);
CREATE INDEX idx_proxy_date ON proxy_logs(created_at DESC);

-- =============================================================================
-- FUNCTIONS AND TRIGGERS
-- =============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to tables with updated_at
CREATE TRIGGER update_creators_timestamp
    BEFORE UPDATE ON creators
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_agent_metadata_timestamp
    BEFORE UPDATE ON agent_metadata
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER update_behavioral_fingerprints_timestamp
    BEFORE UPDATE ON behavioral_fingerprints
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Audit log trigger for identity status changes
CREATE OR REPLACE FUNCTION audit_identity_status_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status IS DISTINCT FROM NEW.status THEN
        INSERT INTO audit_log (
            entity_type, entity_id, action, action_category,
            actor_type, old_values, new_values
        ) VALUES (
            'agent_identity', NEW.id, 'status_change', 'identity',
            'system',
            jsonb_build_object('status', OLD.status),
            jsonb_build_object('status', NEW.status, 'reason', NEW.status_reason)
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_identity_status
    AFTER UPDATE ON agent_identities
    FOR EACH ROW EXECUTE FUNCTION audit_identity_status_change();

-- Prevent modifications to sealed configs
CREATE OR REPLACE FUNCTION prevent_sealed_config_modification()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.sealed_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot modify sealed agent configuration. Identity hash: %',
            (SELECT identity_hash FROM agent_identities WHERE id = OLD.agent_id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_sealed_modifications
    BEFORE UPDATE ON agent_core_configs
    FOR EACH ROW EXECUTE FUNCTION prevent_sealed_config_modification();

-- Prevent deletion of validated identities (must archive instead)
CREATE OR REPLACE FUNCTION prevent_validated_identity_deletion()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.status = 'validated' THEN
        RAISE EXCEPTION 'Cannot delete validated identity. Archive it instead. Hash: %',
            OLD.identity_hash;
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER prevent_validated_deletion
    BEFORE DELETE ON agent_identities
    FOR EACH ROW EXECUTE FUNCTION prevent_validated_identity_deletion();

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Active validated agents view
CREATE VIEW v_active_agents AS
SELECT
    ai.id,
    ai.identity_hash,
    ai.status,
    ai.validated_at,
    ai.last_verified_at,
    am.display_name,
    am.avatar_url,
    am.bio,
    am.tags,
    acc.model_provider,
    acc.model_id,
    c.display_name as creator_name,
    bf.consistency_score,
    aa.autonomy_score,
    aa.classification as autonomy_classification
FROM agent_identities ai
JOIN agent_metadata am ON am.agent_id = ai.id
JOIN agent_core_configs acc ON acc.agent_id = ai.id
JOIN creators c ON c.id = ai.creator_id
LEFT JOIN behavioral_fingerprints bf ON bf.agent_id = ai.id AND bf.is_baseline = TRUE
LEFT JOIN LATERAL (
    SELECT autonomy_score, classification
    FROM autonomy_analyses
    WHERE agent_id = ai.id
    ORDER BY analyzed_at DESC
    LIMIT 1
) aa ON TRUE
WHERE ai.status = 'validated';

-- Agents pending validation
CREATE VIEW v_pending_agents AS
SELECT
    ai.id,
    ai.identity_hash,
    ai.created_at,
    am.display_name,
    acc.model_provider,
    acc.model_id,
    c.email as creator_email,
    vc.status as challenge_status,
    vc.expires_at as challenge_expires
FROM agent_identities ai
JOIN agent_metadata am ON am.agent_id = ai.id
JOIN agent_core_configs acc ON acc.agent_id = ai.id
JOIN creators c ON c.id = ai.creator_id
LEFT JOIN validation_challenges vc ON vc.agent_id = ai.id AND vc.status = 'pending'
WHERE ai.status IN ('pending', 'validating');

-- =============================================================================
-- INITIAL DATA / SEEDS
-- =============================================================================

-- System issuer for self-signed attestations
INSERT INTO creators (id, email, email_hash, display_name, email_verified, is_active)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    'system@agent007.identity',
    encode(sha256('system@agent007.identity'::bytea), 'hex'),
    'Agent007 System',
    TRUE,
    TRUE
) ON CONFLICT (id) DO NOTHING;

-- =============================================================================
-- COMMENTS
-- =============================================================================

COMMENT ON TABLE agent_identities IS 'Main table for agent identities. The identity_hash is the Merkle root of all components.';
COMMENT ON TABLE agent_core_configs IS 'Immutable core configuration. Cannot be modified after sealed_at is set.';
COMMENT ON TABLE attestations IS 'Cryptographic attestations proving agent identity and behavior.';
COMMENT ON TABLE behavioral_fingerprints IS 'Statistical fingerprint of agent behavior for consistency checking.';
COMMENT ON TABLE autonomy_analyses IS 'Results of autonomy detection analysis.';
COMMENT ON TABLE identity_violations IS 'Records of detected identity violations (attempted modifications).';
COMMENT ON COLUMN agent_identities.identity_hash IS 'SHA-256 Merkle root of all identity components. Primary identifier.';
COMMENT ON COLUMN agent_core_configs.sealed_at IS 'Once set, no modifications are allowed to this configuration.';
