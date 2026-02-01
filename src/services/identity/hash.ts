/**
 * Agent007 - Identity Hash Service
 *
 * Implements Merkle tree-based identity hashing for AI agents.
 * The identity hash is a cryptographic fingerprint that uniquely
 * identifies an agent's configuration and cannot be forged.
 */

import { createHash } from 'crypto';
import type {
  AgentCoreIdentity,
  ComponentHashes,
  SystemPrompt,
  ModelConfig,
  GenerationParameters,
  ToolDefinition,
  KnowledgeBase,
  KnowledgeDocument,
} from '../../types/identity.js';
import { ToolDependencyType } from '../../types/identity.js';

// =============================================================================
// TYPES
// =============================================================================

export interface MerkleNode {
  hash: string;
  left?: MerkleNode;
  right?: MerkleNode;
  data?: string;
  label?: string;
}

export interface MerkleProof {
  leaf: string;
  root: string;
  path: Array<{
    hash: string;
    position: 'left' | 'right';
  }>;
}

export interface HashResult {
  identityHash: string;
  componentHashes: ComponentHashes;
  merkleTree: MerkleNode;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const HASH_ALGORITHM = 'sha256';
const HASH_ENCODING = 'hex' as const;

// Component labels for consistent ordering
const COMPONENT_ORDER = [
  'systemPrompt',
  'modelConfig',
  'parameters',
  'tools',
  'knowledgeBase',
  'toolDependencies',
] as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Creates a SHA-256 hash of the input
 */
function sha256(input: string): string {
  return createHash(HASH_ALGORITHM).update(input, 'utf8').digest(HASH_ENCODING);
}

/**
 * Combines two hashes into a parent hash (for Merkle tree)
 */
function combineHashes(left: string, right: string): string {
  // Sort to ensure consistent ordering regardless of input order
  const combined = left < right ? left + right : right + left;
  return sha256(combined);
}

/**
 * Serializes an object to a deterministic JSON string
 * (sorted keys to ensure consistent hashing)
 */
function deterministicStringify(obj: unknown): string {
  if (obj === null || obj === undefined) {
    return 'null';
  }

  if (typeof obj !== 'object') {
    return JSON.stringify(obj);
  }

  if (Array.isArray(obj)) {
    const items = obj.map((item) => deterministicStringify(item));
    return '[' + items.join(',') + ']';
  }

  const keys = Object.keys(obj as object).sort();
  const pairs = keys.map((key) => {
    const value = (obj as Record<string, unknown>)[key];
    return JSON.stringify(key) + ':' + deterministicStringify(value);
  });

  return '{' + pairs.join(',') + '}';
}

// =============================================================================
// COMPONENT HASHERS
// =============================================================================

/**
 * Hashes the system prompt component
 */
function hashSystemPrompt(prompt: SystemPrompt): string {
  const data = {
    content: prompt.content,
    version: prompt.version,
  };
  return sha256(deterministicStringify(data));
}

/**
 * Hashes the model configuration component
 */
function hashModelConfig(model: ModelConfig): string {
  const data = {
    provider: model.provider,
    modelId: model.modelId,
    modelVersion: model.modelVersion || null,
    apiKeyHash: model.apiKeyHash,
    apiEndpoint: model.apiEndpoint,
    authMethod: model.authMethod,
  };
  return sha256(deterministicStringify(data));
}

/**
 * Hashes the generation parameters component
 */
function hashParameters(params: GenerationParameters): string {
  const data = {
    temperature: params.temperature,
    topP: params.topP ?? null,
    topK: params.topK ?? null,
    maxTokens: params.maxTokens,
    presencePenalty: params.presencePenalty ?? null,
    frequencyPenalty: params.frequencyPenalty ?? null,
    stopSequences: params.stopSequences ?? [],
    seed: params.seed ?? null,
  };
  return sha256(deterministicStringify(data));
}

/**
 * Hashes a single tool definition
 */
function hashTool(tool: Omit<ToolDefinition, 'hash'>): string {
  const data = {
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  };
  return sha256(deterministicStringify(data));
}

/**
 * Hashes all tools into a single hash using a sub-Merkle tree
 */
function hashTools(tools: ToolDefinition[]): string {
  if (tools.length === 0) {
    return sha256('[]');
  }

  // Sort tools by name for consistent ordering
  const sortedTools = [...tools].sort((a, b) => a.name.localeCompare(b.name));

  // Build sub-Merkle tree for tools
  let hashes = sortedTools.map((tool) => tool.hash || hashTool(tool));

  // Pad to power of 2 if necessary
  while (hashes.length > 1 && (hashes.length & (hashes.length - 1)) !== 0) {
    hashes.push(sha256(''));
  }

  // Build tree bottom-up
  while (hashes.length > 1) {
    const newLevel: string[] = [];
    for (let i = 0; i < hashes.length; i += 2) {
      const left = hashes[i]!;
      const right = hashes[i + 1] || left;
      newLevel.push(combineHashes(left, right));
    }
    hashes = newLevel;
  }

  return hashes[0]!;
}

/**
 * Hashes a knowledge document
 */
function hashDocument(doc: Omit<KnowledgeDocument, 'hash' | 'id'>): string {
  const data = {
    name: doc.name,
    mimeType: doc.mimeType,
    size: doc.size,
    contentHash: doc.contentHash,
  };
  return sha256(deterministicStringify(data));
}

/**
 * Hashes the knowledge base component
 */
function hashKnowledgeBase(kb: KnowledgeBase | undefined): string {
  if (!kb || kb.documents.length === 0) {
    return sha256('null');
  }

  // Sort documents by content hash for consistent ordering
  const sortedDocs = [...kb.documents].sort((a, b) =>
    a.contentHash.localeCompare(b.contentHash)
  );

  // Combine all document hashes
  const docHashes = sortedDocs.map((doc) => doc.contentHash);
  return sha256(docHashes.join(':'));
}

/**
 * Hashes critical tool dependencies (agents used as tools)
 *
 * Only CRITICAL tools that are agents (have agentIdentityHash) are included.
 * UTILITY tools (calculators, formatters, etc.) do not affect the identity hash.
 *
 * This allows composite agents to have their identity tied to their critical
 * sub-agent dependencies, creating a verifiable chain of agent identities.
 */
function hashToolDependencies(tools: ToolDefinition[]): string {
  // Filter to only critical tools that are agents
  const criticalAgentTools = tools
    .filter(
      (t) =>
        t.dependencyType === ToolDependencyType.CRITICAL && t.agentIdentityHash
    )
    .sort((a, b) => a.name.localeCompare(b.name));

  if (criticalAgentTools.length === 0) {
    return sha256('[]');
  }

  // Create deterministic string from tool name and agent hash pairs
  const dependencyStrings = criticalAgentTools.map(
    (t) => `${t.name}:${t.agentIdentityHash}`
  );

  return sha256(dependencyStrings.join(':'));
}

// =============================================================================
// MERKLE TREE BUILDER
// =============================================================================

/**
 * Builds a Merkle tree from component hashes
 */
function buildMerkleTree(componentHashes: Omit<ComponentHashes, 'merkleRoot'>): MerkleNode {
  // Create leaf nodes in consistent order
  const leaves: MerkleNode[] = COMPONENT_ORDER.map((label) => {
    const hashKey = `${label}Hash` as keyof typeof componentHashes;
    // Handle optional fields (e.g., toolDependenciesHash) with default empty hash
    const hash = componentHashes[hashKey] ?? sha256('[]');
    return {
      hash,
      label,
    };
  });

  // Pad to power of 2 (5 components -> 8 leaves)
  while (leaves.length < 8) {
    leaves.push({
      hash: sha256(''),
      label: 'padding',
    });
  }

  // Build tree bottom-up
  let currentLevel = leaves;

  while (currentLevel.length > 1) {
    const nextLevel: MerkleNode[] = [];

    for (let i = 0; i < currentLevel.length; i += 2) {
      const left = currentLevel[i]!;
      const right = currentLevel[i + 1]!;

      nextLevel.push({
        hash: combineHashes(left.hash, right.hash),
        left,
        right,
      });
    }

    currentLevel = nextLevel;
  }

  return currentLevel[0]!;
}

/**
 * Generates a Merkle proof for a specific component
 */
function generateProof(
  tree: MerkleNode,
  targetHash: string,
  path: MerkleProof['path'] = []
): MerkleProof['path'] | null {
  if (tree.hash === targetHash && !tree.left && !tree.right) {
    return path;
  }

  if (tree.left && tree.right) {
    // Try left subtree
    const leftPath = generateProof(tree.left, targetHash, [
      ...path,
      { hash: tree.right.hash, position: 'right' },
    ]);
    if (leftPath) return leftPath;

    // Try right subtree
    const rightPath = generateProof(tree.right, targetHash, [
      ...path,
      { hash: tree.left.hash, position: 'left' },
    ]);
    if (rightPath) return rightPath;
  }

  return null;
}

/**
 * Verifies a Merkle proof
 */
function verifyProof(proof: MerkleProof): boolean {
  let currentHash = proof.leaf;

  for (const step of proof.path) {
    if (step.position === 'left') {
      currentHash = combineHashes(step.hash, currentHash);
    } else {
      currentHash = combineHashes(currentHash, step.hash);
    }
  }

  return currentHash === proof.root;
}

// =============================================================================
// MAIN SERVICE CLASS
// =============================================================================

export class IdentityHashService {
  /**
   * Computes the complete identity hash for an agent
   */
  computeIdentityHash(core: AgentCoreIdentity): HashResult {
    // Compute individual component hashes
    const systemPromptHash = hashSystemPrompt(core.systemPrompt);
    const modelConfigHash = hashModelConfig(core.model);
    const parametersHash = hashParameters(core.parameters);
    const toolsHash = hashTools(core.tools);
    const knowledgeBaseHash = hashKnowledgeBase(core.knowledgeBase);
    const toolDependenciesHash = hashToolDependencies(core.tools);

    const componentHashes: Omit<ComponentHashes, 'merkleRoot'> = {
      systemPromptHash,
      modelConfigHash,
      parametersHash,
      toolsHash,
      knowledgeBaseHash,
      toolDependenciesHash,
    };

    // Build Merkle tree
    const merkleTree = buildMerkleTree(componentHashes);

    return {
      identityHash: merkleTree.hash,
      componentHashes: {
        ...componentHashes,
        merkleRoot: merkleTree.hash,
      },
      merkleTree,
    };
  }

  /**
   * Verifies that a core identity matches an identity hash
   */
  verifyIdentity(core: AgentCoreIdentity, expectedHash: string): boolean {
    const { identityHash } = this.computeIdentityHash(core);
    return identityHash === expectedHash;
  }

  /**
   * Generates a proof that a specific component is part of the identity
   */
  generateComponentProof(
    merkleTree: MerkleNode,
    componentHash: string
  ): MerkleProof | null {
    const path = generateProof(merkleTree, componentHash);

    if (!path) {
      return null;
    }

    return {
      leaf: componentHash,
      root: merkleTree.hash,
      path,
    };
  }

  /**
   * Verifies a component proof
   */
  verifyComponentProof(proof: MerkleProof): boolean {
    return verifyProof(proof);
  }

  /**
   * Computes hash for a single system prompt
   */
  hashSystemPrompt(content: string, version: string = '1.0'): string {
    return hashSystemPrompt({ content, hash: '', version, createdAt: '' });
  }

  /**
   * Computes hash for model configuration
   */
  hashModelConfig(config: ModelConfig): string {
    return hashModelConfig(config);
  }

  /**
   * Computes hash for generation parameters
   */
  hashParameters(params: GenerationParameters): string {
    return hashParameters(params);
  }

  /**
   * Computes hash for a tool definition
   */
  hashTool(tool: Omit<ToolDefinition, 'hash'>): string {
    return hashTool(tool);
  }

  /**
   * Computes hash for a knowledge document
   */
  hashDocument(doc: Omit<KnowledgeDocument, 'hash' | 'id'>): string {
    return hashDocument(doc);
  }

  /**
   * Computes hash for critical tool dependencies
   * Only includes CRITICAL tools that are agents (have agentIdentityHash)
   */
  hashToolDependencies(tools: ToolDefinition[]): string {
    return hashToolDependencies(tools);
  }

  /**
   * Computes content hash for raw document content
   */
  hashContent(content: Buffer | string): string {
    const data = typeof content === 'string' ? content : content.toString('utf8');
    return sha256(data);
  }

  /**
   * Computes hash for an API key (for storage, not the key itself)
   */
  hashApiKey(apiKey: string): string {
    // Use double hashing for API keys for extra security
    return sha256(sha256(apiKey));
  }

  /**
   * Detects which components have changed between two identities
   */
  detectChanges(
    oldHashes: ComponentHashes,
    newHashes: ComponentHashes
  ): Array<{ component: string; oldHash: string; newHash: string }> {
    const changes: Array<{ component: string; oldHash: string; newHash: string }> = [];

    const components: Array<keyof Omit<ComponentHashes, 'merkleRoot'>> = [
      'systemPromptHash',
      'modelConfigHash',
      'parametersHash',
      'toolsHash',
      'knowledgeBaseHash',
      'toolDependenciesHash',
    ];

    for (const component of components) {
      const oldHash = oldHashes[component];
      const newHash = newHashes[component];
      // Handle optional toolDependenciesHash (may be undefined in old data)
      if (oldHash !== newHash && (oldHash || newHash)) {
        changes.push({
          component: component.replace('Hash', ''),
          oldHash: oldHash || '',
          newHash: newHash || '',
        });
      }
    }

    return changes;
  }

  /**
   * Creates a preview hash (first 16 characters) for display
   */
  createHashPreview(hash: string): string {
    return hash.substring(0, 16);
  }

  /**
   * Validates a hash format
   */
  isValidHash(hash: string): boolean {
    return /^[a-f0-9]{64}$/.test(hash);
  }
}

// Export singleton instance
export const identityHashService = new IdentityHashService();

// Export utility functions for direct use
export {
  sha256,
  combineHashes,
  deterministicStringify,
  hashSystemPrompt,
  hashModelConfig,
  hashParameters,
  hashTool,
  hashTools,
  hashKnowledgeBase,
  hashDocument,
  hashToolDependencies,
  buildMerkleTree,
  generateProof,
  verifyProof,
};
