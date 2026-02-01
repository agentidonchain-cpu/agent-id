/**
 * Agent007 - Agent Routes
 *
 * API endpoints for agent registration, validation, and verification.
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { identityHashService } from '../services/identity/hash.js';
import { challengeService } from '../services/validation/challenge.js';
import { getEncryptionService } from '../services/security/encryption.js';
import { getAttestationService } from '../services/attestation/attestation.js';
import { autonomyDetector } from '../services/autonomy/detector.js';
import { fingerprintService, type ResponseSample } from '../services/autonomy/fingerprint.js';
import { getContinuousVerificationService } from '../services/verification/continuous.js';
import { getAgentStorageService, type StoredRegistration, type StoredIdentity } from '../services/storage/index.js';
import { AttestationType, TrustLevel, VerificationCheckType, AlertSeverity } from '../types/identity.js';
import { apiKeyAuth, type AuthenticatedRequest } from '../middleware/auth.js';
import { ValidationError, NotFoundError, ConflictError } from '../middleware/errorHandler.js';
import { logger } from '../utils/logger.js';
import {
  ModelProvider,
  IdentityStatus,
  type AgentCoreIdentity,
  type AgentMetadata,
  type SystemPrompt,
  type ModelConfig,
  type GenerationParameters,
  type ToolDefinition,
} from '../types/identity.js';

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const modelConfigSchema = z.object({
  provider: z.nativeEnum(ModelProvider),
  modelId: z.string().min(1).max(100),
  modelVersion: z.string().optional(),
  apiKey: z.string().min(1), // Will be hashed, not stored
  apiEndpoint: z.string().url(),
  authMethod: z.enum(['bearer', 'api_key', 'custom']).default('bearer'),
});

const generationParametersSchema = z.object({
  temperature: z.number().min(0).max(2),
  topP: z.number().min(0).max(1).optional(),
  topK: z.number().int().positive().optional(),
  maxTokens: z.number().int().min(1).max(128000),
  presencePenalty: z.number().min(-2).max(2).optional(),
  frequencyPenalty: z.number().min(-2).max(2).optional(),
  stopSequences: z.array(z.string()).optional(),
  seed: z.number().int().optional(),
});

const toolParameterSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    type: z.enum(['string', 'number', 'boolean', 'object', 'array']),
    description: z.string(),
    required: z.boolean().optional(),
    enum: z.array(z.string()).optional(),
    properties: z.record(toolParameterSchema).optional(),
    items: toolParameterSchema.optional(),
  })
);

const toolDefinitionSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1),
  parameters: z.object({
    type: z.literal('object'),
    properties: z.record(toolParameterSchema),
    required: z.array(z.string()).optional(),
  }),
});

const knowledgeDocumentSchema = z.object({
  name: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  size: z.number().int().positive(),
  content: z.string(), // Base64 encoded content
});

const metadataSchema = z.object({
  displayName: z.string().min(1).max(100),
  avatar: z.string().url().optional(),
  bio: z.string().max(1000).optional(),
  tags: z.array(z.string().max(50)).max(10).default([]),
  socialLinks: z.object({
    twitter: z.string().optional(),
    github: z.string().optional(),
    website: z.string().url().optional(),
  }).optional(),
});

const registerAgentSchema = z.object({
  agent: z.object({
    systemPrompt: z.string().min(10).max(100000),
    model: modelConfigSchema,
    parameters: generationParametersSchema,
    tools: z.array(toolDefinitionSchema).default([]),
    knowledgeBase: z.array(knowledgeDocumentSchema).optional(),
  }),
  metadata: metadataSchema,
});

const validateAgentSchema = z.object({
  registrationId: z.string().uuid(),
  challengeId: z.string().uuid(),
  responses: z.array(z.object({
    promptId: z.string().uuid(),
    content: z.string().min(1),
    latencyMs: z.number().int().positive(),
    providerAttestation: z.object({
      signature: z.string(),
      timestamp: z.string(),
      requestId: z.string(),
    }).optional(),
  })),
});

// =============================================================================
// STORAGE SERVICE
// =============================================================================

// Get storage service instance (uses database when available, falls back to memory)
const getStorage = () => getAgentStorageService();

// =============================================================================
// ROUTER
// =============================================================================

const router = Router();

/**
 * POST /agents/register
 * Register a new agent identity
 */
router.post(
  '/register',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const parseResult = registerAgentSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { agent, metadata } = parseResult.data;
      const creatorId = req.creator?.id || 'unknown';

      logger.info({ creatorId, displayName: metadata.displayName }, 'Agent registration started');

      // Hash the API key
      const encryptionService = getEncryptionService();
      const apiKeyHash = encryptionService.hashApiKey(agent.model.apiKey);

      // Create system prompt object
      const systemPrompt: SystemPrompt = {
        content: agent.systemPrompt,
        hash: identityHashService.hashSystemPrompt(agent.systemPrompt),
        version: '1.0',
        createdAt: new Date().toISOString(),
      };

      // Create model config (with hashed API key)
      const modelConfig: ModelConfig = {
        provider: agent.model.provider,
        modelId: agent.model.modelId,
        modelVersion: agent.model.modelVersion,
        apiKeyHash,
        apiEndpoint: agent.model.apiEndpoint,
        authMethod: agent.model.authMethod,
      };

      // Create parameters object
      const parameters: GenerationParameters = {
        temperature: agent.parameters.temperature,
        topP: agent.parameters.topP,
        topK: agent.parameters.topK,
        maxTokens: agent.parameters.maxTokens,
        presencePenalty: agent.parameters.presencePenalty,
        frequencyPenalty: agent.parameters.frequencyPenalty,
        stopSequences: agent.parameters.stopSequences,
        seed: agent.parameters.seed,
      };

      // Hash and create tools
      const tools: ToolDefinition[] = agent.tools.map((tool) => ({
        ...tool,
        hash: identityHashService.hashTool(tool),
      }));

      // Create core identity
      const agentCore: AgentCoreIdentity = {
        systemPrompt,
        model: modelConfig,
        parameters,
        tools,
        knowledgeBase: undefined, // TODO: Handle knowledge base upload
      };

      // Compute identity hash
      const hashResult = identityHashService.computeIdentityHash(agentCore);

      // Check if identity already exists
      if (await getStorage().identityExists(hashResult.identityHash)) {
        throw new ConflictError('An agent with this exact configuration already exists');
      }

      // Create agent metadata
      const agentMetadata: AgentMetadata = {
        displayName: metadata.displayName,
        avatar: metadata.avatar,
        bio: metadata.bio,
        tags: metadata.tags,
        socialLinks: metadata.socialLinks,
        updatedAt: new Date().toISOString(),
      };

      // Generate validation challenge
      const { challenge, encrypted } = await challengeService.generateChallenge(
        uuidv4(),
        agentCore
      );

      // Store registration
      const registrationId = uuidv4();
      const registration: StoredRegistration = {
        id: registrationId,
        creatorId,
        agentCore,
        metadata: agentMetadata,
        identityHash: hashResult.identityHash,
        challengeEncrypted: encrypted,
        challengeId: challenge.id,
        status: 'pending',
        createdAt: new Date(),
        expiresAt: challenge.expiresAt,
      };

      await getStorage().saveRegistration(registration);

      logger.info(
        {
          registrationId,
          identityHashPreview: identityHashService.createHashPreview(hashResult.identityHash),
        },
        'Agent registration created'
      );

      // Return response
      res.status(201).json({
        success: true,
        data: {
          registrationId,
          challenge: {
            id: challenge.id,
            prompts: challenge.prompts.map((p) => ({
              id: p.id,
              prompt: p.prompt,
            })),
            expiresAt: challenge.expiresAt.toISOString(),
          },
          identityHashPreview: identityHashService.createHashPreview(hashResult.identityHash),
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /agents/validate
 * Submit challenge responses for validation
 */
router.post(
  '/validate',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      // Validate request body
      const parseResult = validateAgentSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { registrationId, challengeId, responses } = parseResult.data;

      // Find registration
      const registration = getStorage().getRegistration(registrationId);
      if (!registration) {
        throw new NotFoundError('Registration');
      }

      // Verify challenge ID matches
      if (registration.challengeId !== challengeId) {
        throw new ValidationError('Challenge ID mismatch');
      }

      // Check if already validated
      if (registration.status === 'validated') {
        throw new ConflictError('Registration already validated');
      }

      // Check expiration
      if (new Date() > registration.expiresAt) {
        registration.status = 'failed';
        throw new ValidationError('Challenge has expired');
      }

      logger.info({ registrationId, challengeId }, 'Validating agent responses');

      // Decrypt challenge
      const encryptionService = getEncryptionService();
      const decrypted = await encryptionService.decrypt(registration.challengeEncrypted);

      if (!decrypted.success) {
        throw new Error('Failed to decrypt challenge');
      }

      const challenge = JSON.parse(decrypted.plaintext);

      // Validate responses
      const validationResult = await challengeService.validateResponses(
        challenge,
        responses.map((r) => ({
          challengeId,
          promptId: r.promptId,
          content: r.content,
          latencyMs: r.latencyMs,
          providerAttestation: r.providerAttestation,
        })),
        registration.agentCore
      );

      if (validationResult.passed) {
        // Create validated identity
        const identity: StoredIdentity = {
          id: uuidv4(),
          identityHash: registration.identityHash,
          creatorId: registration.creatorId,
          status: IdentityStatus.VALIDATED,
          agentCore: registration.agentCore,
          metadata: registration.metadata,
          createdAt: registration.createdAt,
          validatedAt: new Date(),
        };

        await getStorage().saveIdentity(identity);
        getStorage().updateRegistrationStatus(registrationId, 'validated');

        logger.info(
          {
            identityHash: registration.identityHash,
            score: validationResult.score,
          },
          'Agent validated successfully'
        );

        res.json({
          success: true,
          data: {
            status: 'validated',
            identityHash: registration.identityHash,
            validationResults: {
              score: validationResult.score,
              behavioralMetrics: validationResult.behavioralMetrics,
            },
            verificationUrl: `/agents/${registration.identityHash}/verify`,
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        registration.status = 'failed';

        logger.warn(
          {
            registrationId,
            score: validationResult.score,
            reasons: validationResult.failureReasons,
          },
          'Agent validation failed'
        );

        res.status(400).json({
          success: false,
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Agent validation failed',
            details: {
              score: validationResult.score,
              failureReasons: validationResult.failureReasons,
              promptResults: validationResult.promptResults,
            },
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
      }
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /agents/:identityHash
 * Get agent identity details
 */
router.get(
  '/:identityHash',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      // Return public information only
      res.json({
        success: true,
        data: {
          identityHash: identity.identityHash,
          agentId: identity.agentId,
          versionNumber: identity.versionNumber,
          previousVersion: identity.previousVersion,
          status: identity.status,
          displayName: identity.metadata.displayName,
          avatar: identity.metadata.avatar,
          bio: identity.metadata.bio,
          tags: identity.metadata.tags,
          model: {
            provider: identity.agentCore.model.provider,
            modelId: identity.agentCore.model.modelId,
          },
          roles: identity.roles,
          createdAt: identity.createdAt.toISOString(),
          validatedAt: identity.validatedAt?.toISOString(),
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /agents/by-agent-id/:agentId
 * Get agent by stable agentId
 * EXPERIMENTAL - Hidden by default
 */
const v2Guard = (_req: Request, res: Response, next: NextFunction) => {
  if (process.env.ENABLE_V2_EXPERIMENTAL !== 'true') {
    res.status(404).end();
    return;
  }
  next();
};

router.get(
  '/by-agent-id/:agentId',
  v2Guard,
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { agentId } = req.params;

      // Validate UUID format
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(agentId)) {
        throw new ValidationError('Invalid agentId format - must be UUID');
      }

      const identity = await getStorage().getIdentityByAgentId(agentId);
      if (!identity) {
        throw new NotFoundError('Agent');
      }

      // Return public information
      res.json({
        success: true,
        data: {
          identityHash: identity.identityHash,
          agentId: identity.agentId,
          versionNumber: identity.versionNumber,
          previousVersion: identity.previousVersion,
          status: identity.status,
          displayName: identity.metadata.displayName,
          avatar: identity.metadata.avatar,
          bio: identity.metadata.bio,
          tags: identity.metadata.tags,
          model: {
            provider: identity.agentCore.model.provider,
            modelId: identity.agentCore.model.modelId,
          },
          roles: identity.roles,
          createdAt: identity.createdAt.toISOString(),
          validatedAt: identity.validatedAt?.toISOString(),
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /agents/:identityHash/verify
 * Verify agent identity integrity
 */
router.get(
  '/:identityHash/verify',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      // Recompute hash to verify integrity
      const recomputedHash = identityHashService.computeIdentityHash(identity.agentCore);
      const hashesMatch = recomputedHash.identityHash === identityHash;

      // Update last verified timestamp
      const verifiedAt = new Date();

      logger.info(
        {
          identityHash,
          valid: hashesMatch,
          status: identity.status,
        },
        'Identity verification performed'
      );

      res.json({
        success: true,
        data: {
          valid: hashesMatch && identity.status === IdentityStatus.VALIDATED,
          status: identity.status,
          identity: {
            hash: identity.identityHash,
            displayName: identity.metadata.displayName,
            avatar: identity.metadata.avatar,
            provider: identity.agentCore.model.provider,
            modelId: identity.agentCore.model.modelId,
            validatedAt: identity.validatedAt?.toISOString(),
          },
          integrity: {
            hashesMatch,
            recomputedHash: recomputedHash.identityHash,
          },
          verifiedAt: verifiedAt.toISOString(),
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /agents
 * List validated agents (with pagination)
 */
router.get(
  '/',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = Math.min(parseInt(req.query.pageSize as string) || 20, 100);

      // Get all validated identities
      const { identities: pageIdentities, total: totalItems } = await getStorage().listIdentities({
        status: IdentityStatus.VALIDATED,
        page,
        pageSize,
      });

      const totalPages = Math.ceil(totalItems / pageSize);

      res.json({
        success: true,
        data: pageIdentities.map((identity) => ({
          identityHash: identity.identityHash,
          displayName: identity.metadata.displayName,
          avatar: identity.metadata.avatar,
          tags: identity.metadata.tags,
          model: {
            provider: identity.agentCore.model.provider,
            modelId: identity.agentCore.model.modelId,
          },
          validatedAt: identity.validatedAt?.toISOString(),
        })),
        pagination: {
          page,
          pageSize,
          totalItems,
          totalPages,
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// AUTONOMY ENDPOINTS
// =============================================================================

// In-memory storage for response samples (MVP - replace with DB)
const responseSamples = new Map<string, ResponseSample[]>();

/**
 * POST /agents/:identityHash/samples
 * Submit response samples for autonomy analysis
 */
router.post(
  '/:identityHash/samples',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      // Validate request body
      const samplesSchema = z.object({
        samples: z.array(z.object({
          content: z.string().min(1),
          latencyMs: z.number().int().positive(),
          timestamp: z.string().datetime().optional(),
          prompt: z.string().optional(),
        })).min(1).max(100),
      });

      const parseResult = samplesSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { samples } = parseResult.data;

      // Convert to ResponseSample format
      const newSamples: ResponseSample[] = samples.map((s) => ({
        content: s.content,
        latencyMs: s.latencyMs,
        timestamp: s.timestamp ? new Date(s.timestamp) : new Date(),
        prompt: s.prompt,
      }));

      // Add to storage
      const existingSamples = responseSamples.get(identityHash) || [];
      const updatedSamples = [...existingSamples, ...newSamples].slice(-500); // Keep last 500
      responseSamples.set(identityHash, updatedSamples);

      logger.info(
        { identityHash, samplesAdded: newSamples.length, totalSamples: updatedSamples.length },
        'Response samples added'
      );

      res.json({
        success: true,
        data: {
          samplesAdded: newSamples.length,
          totalSamples: updatedSamples.length,
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /agents/:identityHash/autonomy
 * Get autonomy analysis for an agent
 */
router.get(
  '/:identityHash/autonomy',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;
      const period = (req.query.period as string) || '7d';

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      // Get samples
      const samples = responseSamples.get(identityHash) || [];

      // Calculate period
      const periodMs = period === '24h' ? 86400000 : period === '30d' ? 2592000000 : 604800000;
      const periodStart = new Date(Date.now() - periodMs);
      const periodEnd = new Date();

      // Filter samples by period
      const periodSamples = samples.filter((s) => s.timestamp >= periodStart);

      // Run analysis
      const analysis = autonomyDetector.analyze(
        identityHash,
        periodSamples,
        periodStart,
        periodEnd
      );

      logger.info(
        {
          identityHash,
          autonomyScore: analysis.autonomyScore,
          classification: analysis.classification,
          samplesAnalyzed: analysis.period.messagesAnalyzed,
        },
        'Autonomy analysis completed'
      );

      res.json({
        success: true,
        data: analysis,
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /agents/:identityHash/fingerprint
 * Get behavioral fingerprint for an agent
 */
router.get(
  '/:identityHash/fingerprint',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      // Get samples
      const samples = responseSamples.get(identityHash) || [];

      if (samples.length < 5) {
        res.json({
          success: true,
          data: {
            fingerprint: null,
            message: 'Insufficient samples for fingerprint (need at least 5)',
            currentSamples: samples.length,
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Create fingerprint
      const fingerprint = fingerprintService.createFingerprint(samples, false);

      res.json({
        success: true,
        data: {
          fingerprint,
          sampleCount: samples.length,
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// ATTESTATION ENDPOINTS
// =============================================================================

/**
 * POST /agents/:identityHash/attestations
 * Create a new attestation for an agent
 */
router.post(
  '/:identityHash/attestations',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      if (identity.status !== IdentityStatus.VALIDATED) {
        throw new ValidationError('Agent must be validated before attestation');
      }

      // Validate request body
      const attestationSchema = z.object({
        type: z.nativeEnum(AttestationType),
        claim: z.string().min(1).max(500),
        data: z.record(z.unknown()).optional(),
      });

      const parseResult = attestationSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const { type, claim, data } = parseResult.data;

      // Create attestation
      const attestationService = getAttestationService();
      const attestation = await attestationService.createAttestation({
        identityHash,
        type,
        trustLevel: TrustLevel.MEDIUM, // API-created attestations are medium trust
        claim,
        data,
      });

      logger.info(
        { identityHash, attestationId: attestation.id, type },
        'Attestation created'
      );

      res.status(201).json({
        success: true,
        data: attestation,
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /agents/:identityHash/certificate
 * Get identity certificate for an agent
 */
router.get(
  '/:identityHash/certificate',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      if (identity.status !== IdentityStatus.VALIDATED) {
        throw new ValidationError('Agent must be validated for certificate');
      }

      // Get autonomy score if available
      const samples = responseSamples.get(identityHash) || [];
      let autonomyScore: number | undefined;

      if (samples.length >= 5) {
        const analysis = autonomyDetector.analyze(
          identityHash,
          samples,
          new Date(Date.now() - 604800000),
          new Date()
        );
        autonomyScore = analysis.autonomyScore;
      }

      // Create certificate
      const attestationService = getAttestationService();
      const certificate = await attestationService.createCertificate(
        identityHash,
        identity.metadata.displayName,
        {
          configurationVerified: true,
          behavioralBaselineEstablished: samples.length >= 5,
          autonomyScore,
          trustLevel: TrustLevel.HIGH,
        }
      );

      logger.info(
        { identityHash, serialNumber: certificate.serialNumber },
        'Certificate generated'
      );

      res.json({
        success: true,
        data: certificate,
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /agents/:identityHash/certificate/verify
 * Verify an identity certificate
 */
router.post(
  '/:identityHash/certificate/verify',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      // Validate request body contains certificate
      const certificateSchema = z.object({
        certificate: z.object({
          version: z.literal('1.0'),
          type: z.literal('agent_identity'),
          subject: z.object({
            identityHash: z.string(),
            displayName: z.string().optional(),
          }),
          issuer: z.object({
            name: z.string(),
            publicKey: z.string(),
          }),
          validity: z.object({
            notBefore: z.string(),
            notAfter: z.string(),
          }),
          claims: z.object({
            configurationVerified: z.boolean(),
            behavioralBaselineEstablished: z.boolean(),
            autonomyScore: z.number().optional(),
            trustLevel: z.nativeEnum(TrustLevel),
          }),
          signature: z.string(),
          serialNumber: z.string(),
        }),
      });

      const parseResult = certificateSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid certificate format', parseResult.error.flatten());
      }

      const { certificate } = parseResult.data;

      // Verify certificate matches identity hash
      if (certificate.subject.identityHash !== identityHash) {
        res.json({
          success: true,
          data: {
            valid: false,
            error: 'Certificate subject does not match identity hash',
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      // Verify certificate signature
      const attestationService = getAttestationService();
      const result = await attestationService.verifyCertificate(certificate);

      res.json({
        success: true,
        data: result,
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// CONTINUOUS VERIFICATION ENDPOINTS
// =============================================================================

/**
 * POST /agents/:identityHash/verification/schedule
 * Schedule continuous verification for an agent
 */
router.post(
  '/:identityHash/verification/schedule',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      if (identity.status !== IdentityStatus.VALIDATED) {
        throw new ValidationError('Agent must be validated for continuous verification');
      }

      // Validate request body
      const scheduleSchema = z.object({
        intervalMs: z.number().int().min(60000).max(86400000).optional(),
        webhookUrl: z.string().url().optional(),
        webhookSecret: z.string().min(16).optional(),
        checks: z.array(z.nativeEnum(VerificationCheckType)).optional(),
        thresholds: z.object({
          identityIntegrity: z.number().min(0).max(1).optional(),
          behavioralDrift: z.number().min(0).max(1).optional(),
          autonomyScore: z.number().min(0).max(1).optional(),
          anomalyScore: z.number().min(0).max(1).optional(),
        }).optional(),
        autoSuspend: z.boolean().optional(),
        maxConsecutiveFailures: z.number().int().min(1).max(10).optional(),
      });

      const parseResult = scheduleSchema.safeParse(req.body);
      if (!parseResult.success) {
        throw new ValidationError('Invalid request body', parseResult.error.flatten());
      }

      const options = parseResult.data;

      // Get or create baseline fingerprint
      const samples = responseSamples.get(identityHash) || [];
      let baselineFingerprint = undefined;
      if (samples.length >= 10) {
        baselineFingerprint = fingerprintService.createFingerprint(samples, true);
      }

      // Schedule verification
      const verificationService = getContinuousVerificationService(responseSamples);
      const schedule = verificationService.scheduleVerification(
        identityHash,
        identity.agentCore,
        {
          intervalMs: options.intervalMs,
          webhookUrl: options.webhookUrl,
          webhookSecret: options.webhookSecret,
          baselineFingerprint: baselineFingerprint ?? undefined,
          config: options.checks || options.thresholds || options.autoSuspend !== undefined
            ? {
                checks: options.checks,
                thresholds: options.thresholds as { identityIntegrity: number; behavioralDrift: number; autonomyScore: number; anomalyScore: number; } | undefined,
                autoSuspend: options.autoSuspend,
                maxConsecutiveFailures: options.maxConsecutiveFailures,
              }
            : undefined,
        }
      );

      logger.info(
        { identityHash, intervalMs: schedule.intervalMs },
        'Continuous verification scheduled'
      );

      res.status(201).json({
        success: true,
        data: {
          schedule,
          baselineEstablished: !!baselineFingerprint,
          sampleCount: samples.length,
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /agents/:identityHash/verification/status
 * Get continuous verification status
 */
router.get(
  '/:identityHash/verification/status',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      const verificationService = getContinuousVerificationService(responseSamples);
      const schedule = verificationService.getScheduleStatus(identityHash);

      if (!schedule) {
        res.json({
          success: true,
          data: {
            scheduled: false,
            message: 'No continuous verification scheduled for this agent',
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
        return;
      }

      res.json({
        success: true,
        data: {
          scheduled: true,
          schedule,
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /agents/:identityHash/verification/run
 * Run a single verification immediately
 */
router.post(
  '/:identityHash/verification/run',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      if (identity.status !== IdentityStatus.VALIDATED) {
        throw new ValidationError('Agent must be validated for verification');
      }

      const verificationService = getContinuousVerificationService(responseSamples);
      const result = await verificationService.runVerification(
        identityHash,
        identity.agentCore
      );

      logger.info(
        {
          identityHash,
          passed: result.passed,
          overallScore: result.overallScore,
          alertCount: result.alerts.length,
        },
        'Manual verification completed'
      );

      res.json({
        success: true,
        data: result,
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * DELETE /agents/:identityHash/verification/schedule
 * Stop continuous verification
 */
router.delete(
  '/:identityHash/verification/schedule',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const verificationService = getContinuousVerificationService(responseSamples);
      const stopped = verificationService.stopVerification(identityHash);

      if (!stopped) {
        throw new NotFoundError('Verification schedule');
      }

      logger.info({ identityHash }, 'Continuous verification stopped');

      res.json({
        success: true,
        data: {
          message: 'Continuous verification stopped',
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /agents/:identityHash/verification/pause
 * Pause continuous verification
 */
router.post(
  '/:identityHash/verification/pause',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const verificationService = getContinuousVerificationService(responseSamples);
      const paused = verificationService.pauseVerification(identityHash);

      if (!paused) {
        throw new NotFoundError('Verification schedule');
      }

      logger.info({ identityHash }, 'Continuous verification paused');

      res.json({
        success: true,
        data: {
          message: 'Continuous verification paused',
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /agents/:identityHash/verification/resume
 * Resume paused verification
 */
router.post(
  '/:identityHash/verification/resume',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const verificationService = getContinuousVerificationService(responseSamples);
      const resumed = verificationService.resumeVerification(identityHash);

      if (!resumed) {
        throw new ValidationError('Cannot resume - verification not paused or not found');
      }

      logger.info({ identityHash }, 'Continuous verification resumed');

      res.json({
        success: true,
        data: {
          message: 'Continuous verification resumed',
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /agents/:identityHash/verification/history
 * Get verification history
 */
router.get(
  '/:identityHash/verification/history',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      const verificationService = getContinuousVerificationService(responseSamples);
      const history = verificationService.getVerificationHistory(identityHash, limit);

      res.json({
        success: true,
        data: {
          history,
          count: history.length,
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * GET /agents/:identityHash/verification/alerts
 * Get verification alerts
 */
router.get(
  '/:identityHash/verification/alerts',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;
      const unacknowledgedOnly = req.query.unacknowledged === 'true';
      const severity = req.query.severity as AlertSeverity | undefined;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      const verificationService = getContinuousVerificationService(responseSamples);
      const alerts = verificationService.getAlerts(identityHash, {
        unacknowledgedOnly,
        severity,
      });

      res.json({
        success: true,
        data: {
          alerts,
          count: alerts.length,
          unacknowledgedCount: alerts.filter((a) => !a.acknowledged).length,
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * POST /agents/:identityHash/verification/alerts/:alertId/acknowledge
 * Acknowledge an alert
 */
router.post(
  '/:identityHash/verification/alerts/:alertId/acknowledge',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { identityHash, alertId } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      const verificationService = getContinuousVerificationService(responseSamples);
      const acknowledged = verificationService.acknowledgeAlert(identityHash, alertId);

      if (!acknowledged) {
        throw new NotFoundError('Alert');
      }

      logger.info({ identityHash, alertId }, 'Alert acknowledged');

      res.json({
        success: true,
        data: {
          message: 'Alert acknowledged',
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      next(error);
    }
  }
);

/**
 * PUT /agents/:identityHash/verification/baseline
 * Update behavioral baseline
 */
router.put(
  '/:identityHash/verification/baseline',
  apiKeyAuth,
  async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      // Get current samples
      const samples = responseSamples.get(identityHash) || [];
      if (samples.length < 10) {
        throw new ValidationError('Insufficient samples for baseline (need at least 10)');
      }

      // Create new baseline
      const baseline = fingerprintService.createFingerprint(samples, true);

      if (!baseline) {
        return res.status(400).json({ error: 'Could not create fingerprint from samples' });
      }

      // Update in verification service
      const verificationService = getContinuousVerificationService(responseSamples);
      const updated = verificationService.updateBaseline(identityHash, baseline);

      logger.info(
        { identityHash, sampleCount: samples.length },
        'Behavioral baseline updated'
      );

      return res.json({
        success: true,
        data: {
          message: 'Behavioral baseline updated',
          baseline,
          sampleCount: samples.length,
          updated,
        },
        meta: {
          requestId: uuidv4(),
          timestamp: new Date().toISOString(),
        },
      });
    } catch (error) {
      return next(error);
    }
  }
);

/**
 * GET /agents/:identityHash/qr
 * Generate QR code for agent verification
 */
router.get(
  '/:identityHash/qr',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { identityHash } = req.params;
      const { format = 'png', size = '256' } = req.query;

      if (!identityHash || !identityHashService.isValidHash(identityHash)) {
        throw new ValidationError('Invalid identity hash format');
      }

      // Verify agent exists
      const identity = await getStorage().getIdentity(identityHash);
      if (!identity) {
        throw new NotFoundError('Agent identity');
      }

      const QRCode = (await import('qrcode')).default;
      const qrSize = parseInt(size as string, 10) || 256;
      const verifyUrl = `https://id-agent.org/verify/${identityHash}`;

      if (format === 'base64' || format === 'json') {
        // Return base64 encoded image
        const base64 = await QRCode.toDataURL(verifyUrl, {
          width: qrSize,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
          errorCorrectionLevel: 'H',
        });

        res.json({
          success: true,
          data: {
            identityHash,
            qrCode: base64,
            url: verifyUrl,
            size: qrSize,
          },
          meta: {
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          },
        });
      } else {
        // Return PNG image directly
        const buffer = await QRCode.toBuffer(verifyUrl, {
          width: qrSize,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#ffffff',
          },
          errorCorrectionLevel: 'H',
        });

        res.set({
          'Content-Type': 'image/png',
          'Content-Length': buffer.length.toString(),
          'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
          'X-Agent-Hash': identityHash,
        });

        res.send(buffer);
      }

      logger.info(
        { identityHash, format, size: qrSize },
        'QR code generated'
      );
    } catch (error) {
      next(error);
    }
  }
);

export default router;
