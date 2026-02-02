-- Additional tables needed by the system

-- Creators
CREATE TABLE IF NOT EXISTS creators (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    api_key_hash VARCHAR(64) UNIQUE NOT NULL,
    name VARCHAR(255),
    email VARCHAR(255),
    organization VARCHAR(255),
    tier VARCHAR(50) DEFAULT 'free',
    rate_limit INTEGER DEFAULT 100,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Validation Challenges
CREATE TABLE IF NOT EXISTS validation_challenges (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    registration_id UUID NOT NULL,
    challenge_type VARCHAR(50) NOT NULL,
    prompts JSONB DEFAULT '[]',
    expected_behaviors JSONB DEFAULT '{}',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status VARCHAR(50) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Attestations
CREATE TABLE IF NOT EXISTS attestations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identity_hash VARCHAR(66) NOT NULL,
    attestation_type VARCHAR(100) NOT NULL,
    trust_level VARCHAR(50) NOT NULL,
    claim TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    issuer_id VARCHAR(255),
    signature TEXT,
    expires_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Behavioral Fingerprints
CREATE TABLE IF NOT EXISTS behavioral_fingerprints (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identity_hash VARCHAR(66) NOT NULL,
    fingerprint JSONB NOT NULL,
    sample_count INTEGER DEFAULT 0,
    is_baseline BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Autonomy Analyses
CREATE TABLE IF NOT EXISTS autonomy_analyses (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identity_hash VARCHAR(66) NOT NULL,
    autonomy_score DECIMAL(5,4),
    classification VARCHAR(50),
    analysis_data JSONB DEFAULT '{}',
    period_start TIMESTAMP WITH TIME ZONE,
    period_end TIMESTAMP WITH TIME ZONE,
    messages_analyzed INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Verification Results
CREATE TABLE IF NOT EXISTS verification_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identity_hash VARCHAR(66) NOT NULL,
    passed BOOLEAN NOT NULL,
    overall_score DECIMAL(5,4),
    checks JSONB DEFAULT '[]',
    alerts JSONB DEFAULT '[]',
    duration_ms INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Alerts
CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identity_hash VARCHAR(66) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT,
    details JSONB DEFAULT '{}',
    acknowledged BOOLEAN DEFAULT false,
    acknowledged_at TIMESTAMP WITH TIME ZONE,
    acknowledged_by VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Identity Violations
CREATE TABLE IF NOT EXISTS identity_violations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identity_hash VARCHAR(66) NOT NULL,
    violation_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    description TEXT,
    evidence JSONB DEFAULT '{}',
    resolved BOOLEAN DEFAULT false,
    resolved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Proxy Logs
CREATE TABLE IF NOT EXISTS proxy_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    identity_hash VARCHAR(66) NOT NULL,
    request_id VARCHAR(100) NOT NULL,
    provider VARCHAR(100),
    model_id VARCHAR(100),
    latency_ms INTEGER,
    tokens_used INTEGER,
    has_attestation BOOLEAN DEFAULT false,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_creators_api_key ON creators(api_key_hash);
CREATE INDEX IF NOT EXISTS idx_validation_challenges_registration ON validation_challenges(registration_id);
CREATE INDEX IF NOT EXISTS idx_attestations_identity ON attestations(identity_hash);
CREATE INDEX IF NOT EXISTS idx_behavioral_fingerprints_identity ON behavioral_fingerprints(identity_hash);
CREATE INDEX IF NOT EXISTS idx_autonomy_analyses_identity ON autonomy_analyses(identity_hash);
CREATE INDEX IF NOT EXISTS idx_verification_results_identity ON verification_results(identity_hash);
CREATE INDEX IF NOT EXISTS idx_alerts_identity ON alerts(identity_hash);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged);
CREATE INDEX IF NOT EXISTS idx_identity_violations_identity ON identity_violations(identity_hash);
CREATE INDEX IF NOT EXISTS idx_proxy_logs_identity ON proxy_logs(identity_hash);
