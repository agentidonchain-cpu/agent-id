-- AgentID Database Schema
-- Run this on your PostgreSQL database

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Agent Identities (main table)
CREATE TABLE IF NOT EXISTS agent_identities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identity_hash VARCHAR(66) UNIQUE NOT NULL,
    agent_id UUID UNIQUE,
    previous_version VARCHAR(66),
    version_number INTEGER DEFAULT 1,
    creator_id VARCHAR(255) NOT NULL,
    owner_address VARCHAR(42),
    operator_address VARCHAR(42),
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    status_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    validated_at TIMESTAMP WITH TIME ZONE,
    suspended_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    archived_at TIMESTAMP WITH TIME ZONE,
    last_verified_at TIMESTAMP WITH TIME ZONE
);

-- Agent Core Configs
CREATE TABLE IF NOT EXISTS agent_core_configs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
    system_prompt_hash VARCHAR(64) NOT NULL,
    system_prompt_encrypted BYTEA,
    system_prompt_version VARCHAR(20) DEFAULT '1.0',
    encryption_key_id VARCHAR(255),
    model_provider VARCHAR(100) NOT NULL,
    model_id VARCHAR(100) NOT NULL,
    model_version VARCHAR(50),
    api_endpoint VARCHAR(500),
    api_key_hash VARCHAR(64),
    auth_method VARCHAR(50) DEFAULT 'bearer',
    parameters JSONB DEFAULT '{}',
    model_config_hash VARCHAR(64),
    parameters_hash VARCHAR(64),
    tools_hash VARCHAR(64),
    knowledge_base_hash VARCHAR(64),
    sealed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent Metadata
CREATE TABLE IF NOT EXISTS agent_metadata (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
    display_name VARCHAR(255) NOT NULL,
    avatar_url VARCHAR(500),
    bio TEXT,
    tags TEXT[] DEFAULT '{}',
    social_twitter VARCHAR(100),
    social_github VARCHAR(100),
    social_website VARCHAR(500),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Agent Tools
CREATE TABLE IF NOT EXISTS agent_tools (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    agent_id UUID NOT NULL REFERENCES agent_identities(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    description_hash VARCHAR(64),
    parameters_schema JSONB DEFAULT '{}',
    parameters_schema_hash VARCHAR(64),
    tool_hash VARCHAR(64),
    position INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Twitter Verifications
CREATE TABLE IF NOT EXISTS twitter_verifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identity_hash VARCHAR(66) NOT NULL,
    handle VARCHAR(100) NOT NULL,
    user_id VARCHAR(50) NOT NULL,
    tweet_id VARCHAR(50) NOT NULL,
    verified_at TIMESTAMP WITH TIME ZONE NOT NULL,
    proof_url VARCHAR(500),
    challenge_code VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(identity_hash)
);

-- Audit Log
CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(255) NOT NULL,
    action VARCHAR(100) NOT NULL,
    actor_id VARCHAR(255),
    actor_type VARCHAR(50),
    details JSONB DEFAULT '{}',
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_agent_identities_hash ON agent_identities(identity_hash);
CREATE INDEX IF NOT EXISTS idx_agent_identities_creator ON agent_identities(creator_id);
CREATE INDEX IF NOT EXISTS idx_agent_identities_status ON agent_identities(status);
CREATE INDEX IF NOT EXISTS idx_agent_identities_agent_id ON agent_identities(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_core_configs_agent ON agent_core_configs(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_metadata_agent ON agent_metadata(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_tools_agent ON agent_tools(agent_id);
CREATE INDEX IF NOT EXISTS idx_twitter_verifications_hash ON twitter_verifications(identity_hash);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);

-- Grant permissions (adjust as needed)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO agent007;
-- GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO agent007;
