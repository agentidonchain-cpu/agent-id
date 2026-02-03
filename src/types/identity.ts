/**
 * Agent007 - Core Identity Types
 *
 * This file defines the complete type system for AI agent identities.
 * The identity is composed of immutable components that together form
 * a unique cryptographic fingerprint (Merkle root).
 */

// =============================================================================
// ENUMS
// =============================================================================

export enum ModelProvider {
  OPENAI = 'openai',
  ANTHROPIC = 'anthropic',
  GOOGLE = 'google',
  COHERE = 'cohere',
  MISTRAL = 'mistral',
  CUSTOM = 'custom',
}

/**
 * Identity Status - ON-CHAIN FIRST Model
 *
 * CRITICAL: "REGISTERED" means on-chain TX mined. Nothing else.
 *
 * - DRAFT: Off-chain only, not yet submitted to blockchain
 * - TX_SUBMITTED: TX broadcast, waiting for confirmation (has txHash)
 * - REGISTERED: On-chain, TX mined (has blockNumber) - THE ONLY "REAL" REGISTRATION
 * - SUSPENDED: Temporarily disabled (can be on-chain or off-chain)
 * - REVOKED: Permanently invalidated
 */
export enum IdentityStatus {
  /** Off-chain only - prepared but not submitted to blockchain */
  DRAFT = 'draft',
  /** TX broadcast, waiting for mining (has txHash, no blockNumber yet) */
  TX_SUBMITTED = 'tx_submitted',
  /** ON-CHAIN REGISTERED - TX mined, has blockNumber. THE ONLY TRUE REGISTRATION. */
  REGISTERED = 'registered',
  /** Temporarily suspended */
  SUSPENDED = 'suspended',
  /** Permanently revoked */
  REVOKED = 'revoked',

  // Legacy aliases for backward compatibility during migration
  /** @deprecated Use DRAFT instead */
  PENDING = 'draft',
  /** @deprecated Use DRAFT instead */
  VALIDATING = 'draft',
  /** @deprecated Use REGISTERED instead (only if on-chain) or DRAFT (if off-chain) */
  VALIDATED = 'draft',
  /** @deprecated No longer used */
  ARCHIVED = 'draft',
}

export enum AttestationType {
  PROVIDER_NATIVE = 'provider_native',
  PROXY_VERIFIED = 'proxy_verified',
  SELF_DECLARED = 'self_declared',
  BEHAVIORAL = 'behavioral',
  IDENTITY_VALIDATION = 'identity_validation',
}

export enum TrustLevel {
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

export enum AutonomyClassification {
  FULLY_AUTONOMOUS = 'fully_autonomous',
  SUPERVISED = 'supervised',
  HYBRID_SUSPICIOUS = 'hybrid_suspicious',
  HUMAN_CONTROLLED = 'human_controlled',
}

export enum ToolDependencyType {
  /** Critical tools affect identity hash - if the tool is an agent, its hash is included */
  CRITICAL = 'critical',
  /** Utility tools don't affect identity (calculators, formatters, etc.) */
  UTILITY = 'utility',
}

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

export interface SystemPrompt {
  /** The complete system prompt content (will be encrypted at rest) */
  content: string;

  /** SHA-256 hash of the content for verification */
  hash: string;

  /** Semantic version of the prompt format */
  version: string;

  /** ISO timestamp of when this prompt was created */
  createdAt: string;
}

// =============================================================================
// MODEL CONFIGURATION
// =============================================================================

export interface ModelConfig {
  /** LLM provider */
  provider: ModelProvider;

  /** Specific model identifier (e.g., "claude-3-sonnet-20240229") */
  modelId: string;

  /** Optional model version for providers that support it */
  modelVersion?: string;

  /** SHA-256 hash of the API key (never store the actual key) */
  apiKeyHash: string;

  /** API endpoint URL for custom providers */
  apiEndpoint: string;

  /** Authentication method */
  authMethod: 'bearer' | 'api_key' | 'custom';
}

// =============================================================================
// GENERATION PARAMETERS
// =============================================================================

export interface GenerationParameters {
  /** Sampling temperature (0.0 - 2.0) */
  temperature: number;

  /** Top-p (nucleus) sampling (0.0 - 1.0) */
  topP?: number;

  /** Top-k sampling */
  topK?: number;

  /** Maximum tokens to generate */
  maxTokens: number;

  /** Presence penalty (-2.0 to 2.0) */
  presencePenalty?: number;

  /** Frequency penalty (-2.0 to 2.0) */
  frequencyPenalty?: number;

  /** Stop sequences */
  stopSequences?: string[];

  /** Random seed for reproducibility */
  seed?: number;
}

// =============================================================================
// TOOLS / FUNCTIONS
// =============================================================================

export interface ToolParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required?: boolean;
  enum?: string[];
  properties?: Record<string, ToolParameter>;
  items?: ToolParameter;
}

export interface ToolDefinition {
  /** Unique tool name */
  name: string;

  /** Human-readable description */
  description: string;

  /** JSON Schema for parameters */
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };

  /** SHA-256 hash of the tool definition */
  hash: string;

  /** Dependency type - critical tools affect identity hash (optional, defaults to utility) */
  dependencyType?: ToolDependencyType;

  /** If this tool is an agent, its identity hash (included in parent's hash if critical) */
  agentIdentityHash?: string;
}

// =============================================================================
// KNOWLEDGE BASE
// =============================================================================

export interface KnowledgeDocument {
  /** Document identifier */
  id: string;

  /** Document name/title */
  name: string;

  /** MIME type */
  mimeType: string;

  /** Document size in bytes */
  size: number;

  /** SHA-256 hash of document content */
  contentHash: string;

  /** Storage reference (e.g., S3/IPFS URI) - content is encrypted */
  storageRef?: string;

  /** When the document was added */
  addedAt: string;
}

export interface KnowledgeBase {
  /** List of documents in the knowledge base */
  documents: KnowledgeDocument[];

  /** Combined hash of all document hashes */
  combinedHash: string;

  /** Total size in bytes */
  totalSize: number;
}

// =============================================================================
// CORE IDENTITY (IMMUTABLE AFTER VALIDATION)
// =============================================================================

export interface AgentCoreIdentity {
  /** System prompt configuration */
  systemPrompt: SystemPrompt;

  /** Model configuration */
  model: ModelConfig;

  /** Generation parameters */
  parameters: GenerationParameters;

  /** Available tools/functions */
  tools: ToolDefinition[];

  /** Knowledge base documents */
  knowledgeBase?: KnowledgeBase;
}

// =============================================================================
// COMPONENT HASHES (FOR MERKLE TREE)
// =============================================================================

export interface ComponentHashes {
  /** Hash of system prompt */
  systemPromptHash: string;

  /** Hash of model configuration */
  modelConfigHash: string;

  /** Hash of generation parameters */
  parametersHash: string;

  /** Hash of tools array */
  toolsHash: string;

  /** Hash of knowledge base */
  knowledgeBaseHash: string;

  /** Hash of critical tool dependencies (agents used as tools) */
  toolDependenciesHash?: string;

  /** Merkle root (final identity hash) */
  merkleRoot: string;
}

// =============================================================================
// AGENT METADATA (MUTABLE)
// =============================================================================

export interface AgentMetadata {
  /** Display name shown on Agent007 */
  displayName: string;

  /** Avatar URL */
  avatar?: string;

  /** Short biography */
  bio?: string;

  /** Searchable tags */
  tags: string[];

  /** Social links */
  socialLinks?: {
    twitter?: string;
    github?: string;
    website?: string;
  };

  /** Last update timestamp */
  updatedAt: string;
}

// =============================================================================
// BEHAVIORAL FINGERPRINT
// =============================================================================

export interface LatencyStatistics {
  /** Mean response time in ms */
  mean: number;

  /** Standard deviation */
  stdDev: number;

  /** Median (p50) */
  p50: number;

  /** 95th percentile */
  p95: number;

  /** 99th percentile */
  p99: number;

  /** Sample count */
  sampleCount: number;
}

export interface VocabularyAnalysis {
  /** Number of unique words used */
  uniqueWordCount: number;

  /** Average sentence length */
  avgSentenceLength: number;

  /** Readability score (Flesch-Kincaid or similar) */
  readabilityScore: number;

  /** Most common n-grams */
  topNgrams: Array<{ ngram: string; frequency: number }>;

  /** Vocabulary richness (type-token ratio) */
  typeTokenRatio: number;
}

export interface StyleMarkers {
  /** Emoji usage frequency (0.0 - 1.0) */
  emojiUsage: number;

  /** Punctuation pattern signature */
  punctuationPattern: string;

  /** Capitalization style */
  capitalizationStyle: 'standard' | 'all_lower' | 'all_upper' | 'mixed';

  /** Common formatting patterns */
  formattingPreferences: string[];

  /** Average paragraph length */
  avgParagraphLength: number;
}

export interface BehavioralFingerprint {
  /** Response latency statistics */
  latency: LatencyStatistics;

  /** Vocabulary analysis */
  vocabulary: VocabularyAnalysis;

  /** Writing style markers */
  style: StyleMarkers;

  /** Topic embedding vector (for similarity comparison) */
  topicVector?: number[];

  /** Overall consistency score (0.0 - 1.0) */
  consistencyScore: number;

  /** Number of samples used to build this fingerprint */
  sampleSize: number;

  /** Whether this is the baseline fingerprint */
  isBaseline: boolean;

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;
}

// =============================================================================
// AUTONOMY ANALYSIS
// =============================================================================

export interface AutonomyScores {
  /** Timing-based score */
  timing: number;

  /** Language pattern score */
  language: number;

  /** Behavioral consistency score */
  behavior: number;
}

export interface AutonomyPattern {
  /** Pattern type identifier */
  type: string;

  /** Severity level */
  severity: 'low' | 'medium' | 'high';

  /** Human-readable description */
  description: string;

  /** Evidence data */
  evidence?: Record<string, unknown>;

  /** When the pattern was detected */
  detectedAt: string;
}

export interface AutonomyAlert {
  /** Alert level */
  level: 'info' | 'warning' | 'critical';

  /** Alert message */
  message: string;

  /** Pattern that triggered the alert */
  triggeredBy?: string;

  /** Recommended action */
  recommendation?: string;
}

export interface AutonomyAnalysis {
  /** Agent identity hash */
  agentIdentityHash: string;

  /** Overall autonomy score (0.0 - 1.0) */
  autonomyScore: number;

  /** Confidence in the analysis (0.0 - 1.0) */
  confidence: number;

  /** Classification result */
  classification: AutonomyClassification;

  /** Individual scores */
  scores: AutonomyScores;

  /** Detected patterns */
  patterns: AutonomyPattern[];

  /** Generated alerts */
  alerts: AutonomyAlert[];

  /** Analysis period */
  period: {
    start: string;
    end: string;
    messagesAnalyzed: number;
  };

  /** When this analysis was performed */
  analyzedAt: string;
}

// =============================================================================
// ATTESTATION
// =============================================================================

export interface AttestationPayload {
  /** Identity hash being attested */
  identityHash: string;

  /** What is being attested */
  claim: string;

  /** Additional claim data */
  data?: Record<string, unknown>;

  /** Nonce for replay protection */
  nonce: string;

  /** Timestamp */
  timestamp: string;
}

export interface Attestation {
  /** Unique attestation ID */
  id: string;

  /** Agent identity hash */
  agentIdentityHash: string;

  /** Type of attestation */
  type: AttestationType;

  /** Trust level */
  trustLevel: TrustLevel;

  /** Attestation payload */
  payload: AttestationPayload;

  /** Cryptographic signature (Ed25519) */
  signature: string;

  /** Issuer information */
  issuer: {
    name: string;
    publicKey: string;
  };

  /** Validity period */
  validity: {
    issuedAt: string;
    validUntil: string;
  };

  /** Revocation status */
  revokedAt?: string;
}

// =============================================================================
// BLOCKCHAIN ANCHOR (OPTIONAL)
// =============================================================================

export interface BlockchainAnchor {
  /** Blockchain network */
  chain: 'base' | 'ethereum' | 'polygon';

  /** Transaction hash */
  transactionHash: string;

  /** Block number */
  blockNumber: number;

  /** IPFS URI for metadata */
  metadataURI?: string;

  /** Timestamp of anchoring */
  anchoredAt: string;
}

// =============================================================================
// IDENTITY ROLES
// =============================================================================

export interface IdentityRoles {
  /** Original creator of this agent identity */
  creator: string;

  /** Current owner (can transfer ownership) */
  owner: string;

  /** Optional operator - can act on behalf of owner but cannot transfer */
  operator?: string;
}

// =============================================================================
// COMPLETE AGENT IDENTITY
// =============================================================================

export interface AgentIdentity {
  /** Unique database ID */
  id: string;

  /** Stable agent identifier (UUID v4) - persists across versions */
  agentId?: string;

  /** Identity hash (Merkle root) - fingerprint of this specific version */
  identityHash: string;

  /** Previous version's identity hash (null for first version) */
  previousVersion?: string | null;

  /** Version number (1-based, linear, monotonic - no silent rollback) */
  versionNumber?: number;

  /** Identity roles (creator, owner, operator) */
  roles?: IdentityRoles;

  /** Creator (human owner) ID - @deprecated use roles.creator instead */
  creatorId: string;

  /** Current status */
  status: IdentityStatus;

  /** Core identity components (immutable after validation) */
  core: AgentCoreIdentity;

  /** Component hashes for verification */
  componentHashes: ComponentHashes;

  /** Mutable metadata */
  metadata: AgentMetadata;

  /** Behavioral fingerprint (baseline established at validation) */
  fingerprint?: BehavioralFingerprint;

  /** Latest autonomy analysis */
  autonomyAnalysis?: AutonomyAnalysis;

  /** Attestations */
  attestations: Attestation[];

  /** Blockchain anchor (optional) */
  blockchainAnchor?: BlockchainAnchor;

  /** Timestamps */
  createdAt: string;
  validatedAt?: string;
  suspendedAt?: string;
  revokedAt?: string;
  lastVerifiedAt?: string;
}

// =============================================================================
// CREATOR (HUMAN OWNER)
// =============================================================================

export interface Creator {
  /** Unique creator ID */
  id: string;

  /** Email address */
  email: string;

  /** Display name */
  displayName: string;

  /** Wallet address for blockchain operations */
  walletAddress?: string;

  /** Email verification status */
  emailVerified: boolean;

  /** MFA enabled */
  mfaEnabled: boolean;

  /** Creation timestamp */
  createdAt: string;

  /** Last update timestamp */
  updatedAt: string;
}

// =============================================================================
// VALIDATION TYPES
// =============================================================================

export interface ValidationChallenge {
  /** Challenge ID */
  id: string;

  /** Registration ID */
  registrationId: string;

  /** Challenge prompts (encrypted) */
  encryptedPrompts: string;

  /** Expiration time */
  expiresAt: string;

  /** Challenge status */
  status: 'pending' | 'completed' | 'failed' | 'expired';

  /** Response data (if completed) */
  response?: {
    content: string;
    latencyMs: number;
    receivedAt: string;
  };

  /** Creation timestamp */
  createdAt: string;
}

export interface RegistrationRequest {
  /** Agent core configuration */
  agent: {
    systemPrompt: string;
    model: Omit<ModelConfig, 'apiKeyHash'> & { apiKey: string };
    parameters: GenerationParameters;
    tools?: Omit<ToolDefinition, 'hash'>[];
    knowledgeBase?: Omit<KnowledgeDocument, 'hash' | 'id'>[];
  };

  /** Agent metadata */
  metadata: Omit<AgentMetadata, 'updatedAt'>;
}

export interface RegistrationResponse {
  /** Whether registration was initiated */
  success: boolean;

  /** Registration ID for tracking */
  registrationId: string;

  /** Validation challenge */
  challenge: {
    id: string;
    encryptedPrompt: string;
    expiresAt: string;
    publicKey: string;
  };

  /** Preview of the identity hash */
  identityHashPreview: string;
}

export interface ValidationRequest {
  /** Registration ID */
  registrationId: string;

  /** Challenge ID */
  challengeId: string;

  /** Challenge response */
  response: {
    content: string;
    providerAttestation?: {
      signature: string;
      timestamp: string;
      requestId: string;
    };
    metadata: {
      latencyMs: number;
      tokensUsed?: number;
      modelVersion?: string;
    };
  };
}

export interface ValidationResponse {
  /** Whether validation succeeded */
  success: boolean;

  /** Validation status */
  status: 'validated' | 'failed' | 'pending_review';

  /** Validation results */
  results?: {
    configurationMatch: boolean;
    providerVerified: boolean;
    behavioralBaseline: boolean;
    autonomyScore: number;
  };

  /** Identity card (if validated) */
  identityCard?: {
    identityHash: string;
    certificate: string;
    expiresAt: string;
    verificationUrl: string;
  };

  /** Failure reasons (if failed) */
  failureReasons?: string[];
}

// =============================================================================
// VERIFICATION TYPES
// =============================================================================

export interface VerificationRequest {
  /** Identity hash to verify */
  identityHash: string;

  /** Optional: include full details */
  includeDetails?: boolean;
}

export interface VerificationResponse {
  /** Whether identity is valid */
  valid: boolean;

  /** Current status */
  status: IdentityStatus;

  /** Identity information */
  identity: {
    hash: string;
    displayName: string;
    avatar?: string;
    provider: ModelProvider;
    modelId: string;
    validatedAt?: string;
    lastVerifiedAt?: string;
  };

  /** Consistency check results */
  consistency?: {
    score: number;
    samplesAnalyzed: number;
    alerts: string[];
  };

  /** Blockchain proof (if anchored) */
  blockchainProof?: {
    chain: string;
    txHash: string;
    verified: boolean;
  };

  /** Verification timestamp */
  verifiedAt: string;
}

// =============================================================================
// CONTINUOUS VERIFICATION
// =============================================================================

export enum VerificationCheckType {
  IDENTITY_INTEGRITY = 'identity_integrity',
  BEHAVIORAL_DRIFT = 'behavioral_drift',
  AUTONOMY_CHECK = 'autonomy_check',
  ANOMALY_DETECTION = 'anomaly_detection',
}

export enum VerificationStatus {
  ACTIVE = 'active',
  PAUSED = 'paused',
  STOPPED = 'stopped',
  FAILED = 'failed',
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export interface VerificationCheckResult {
  /** Type of check performed */
  checkType: VerificationCheckType;

  /** Whether the check passed */
  passed: boolean;

  /** Score (0.0 - 1.0) */
  score: number;

  /** Details of the check */
  details: Record<string, unknown>;

  /** Issues found (if any) */
  issues: string[];

  /** When check was performed */
  performedAt: string;
}

export interface VerificationResult {
  /** Unique verification ID */
  id: string;

  /** Agent identity hash */
  identityHash: string;

  /** Overall verification passed */
  passed: boolean;

  /** Overall score (0.0 - 1.0) */
  overallScore: number;

  /** Individual check results */
  checks: VerificationCheckResult[];

  /** Generated alerts */
  alerts: VerificationAlert[];

  /** When verification was performed */
  verifiedAt: string;

  /** Duration of verification in ms */
  durationMs: number;
}

export interface VerificationAlert {
  /** Unique alert ID */
  id: string;

  /** Alert severity */
  severity: AlertSeverity;

  /** Alert title */
  title: string;

  /** Detailed message */
  message: string;

  /** Check that triggered the alert */
  triggeredBy: VerificationCheckType;

  /** Recommended action */
  recommendation?: string;

  /** When alert was created */
  createdAt: string;

  /** Whether alert has been acknowledged */
  acknowledged: boolean;

  /** Webhook delivery status */
  webhookDelivered?: boolean;
}

export interface VerificationSchedule {
  /** Agent identity hash */
  identityHash: string;

  /** Current status */
  status: VerificationStatus;

  /** Interval between verifications (ms) */
  intervalMs: number;

  /** When schedule was created */
  createdAt: string;

  /** Last verification time */
  lastVerificationAt?: string;

  /** Next scheduled verification */
  nextVerificationAt?: string;

  /** Total verifications performed */
  totalVerifications: number;

  /** Failed verifications count */
  failedVerifications: number;

  /** Consecutive failures */
  consecutiveFailures: number;

  /** Webhook URL for notifications */
  webhookUrl?: string;

  /** Webhook secret for signature */
  webhookSecret?: string;
}

export interface VerificationConfig {
  /** Checks to perform */
  checks: VerificationCheckType[];

  /** Thresholds for each check */
  thresholds: {
    identityIntegrity: number;
    behavioralDrift: number;
    autonomyScore: number;
    anomalyScore: number;
  };

  /** Alert configuration */
  alerts: {
    enabled: boolean;
    webhookUrl?: string;
    webhookSecret?: string;
    minSeverity: AlertSeverity;
  };

  /** Auto-suspend on critical failures */
  autoSuspend: boolean;

  /** Max consecutive failures before suspension */
  maxConsecutiveFailures: number;
}

// =============================================================================
// API RESPONSE WRAPPERS
// =============================================================================

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta?: {
    requestId: string;
    timestamp: string;
  };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    pageSize: number;
    totalItems: number;
    totalPages: number;
  };
}
