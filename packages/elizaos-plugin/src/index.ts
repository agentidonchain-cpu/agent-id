/**
 * @agentid/elizaos-plugin
 *
 * AgentID plugin for ElizaOS - Automatic identity registration
 * and runtime attestation for AI agents.
 *
 * @example
 * ```typescript
 * import { agentidPlugin } from '@agentid/elizaos-plugin';
 *
 * const agent = new Agent({
 *   character: myCharacter,
 *   plugins: [
 *     agentidPlugin({
 *       autoRegister: true,
 *       selfVerifyInterval: 3600000, // 1 hour
 *     })
 *   ]
 * });
 * ```
 */

import {
  RuntimeAttestor,
  generateKeyPair,
  generateRuntimeHashes,
  sha256,
} from '@agentid/runtime-sdk';

// =============================================================================
// TYPES
// =============================================================================

export interface AgentIDPluginConfig {
  /** Existing identity hash (if already registered) */
  identityHash?: string;

  /** Existing private key (if already registered) */
  privateKey?: string;

  /** Existing public key (if already registered) */
  publicKey?: string;

  /** Auto-register on agent startup */
  autoRegister?: boolean;

  /** Self-verify interval in milliseconds (0 = disabled) */
  selfVerifyInterval?: number;

  /** API base URL */
  apiUrl?: string;

  /** Store keys in environment variables */
  persistKeys?: boolean;

  /** Callback when registration completes */
  onRegistered?: (identityHash: string, keys: { publicKey: string; privateKey: string }) => void;

  /** Callback when attestation completes */
  onAttested?: (driftScore: number) => void;

  /** Callback on error */
  onError?: (error: Error) => void;
}

export interface ElizaOSPlugin {
  name: string;
  description: string;
  actions?: any[];
  evaluators?: any[];
  providers?: any[];
  services?: any[];
}

export interface ElizaOSCharacter {
  name: string;
  system?: string;
  bio?: string[];
  modelProvider?: string;
  settings?: Record<string, any>;
  plugins?: string[];
  clients?: string[];
  [key: string]: any;
}

export interface ElizaOSRuntime {
  character: ElizaOSCharacter;
  getSetting: (key: string) => string | undefined;
  registerAction: (action: any) => void;
}

// =============================================================================
// PLUGIN STATE
// =============================================================================

let attestor: RuntimeAttestor | null = null;
let registeredIdentityHash: string | null = null;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Compute identity hash from ElizaOS character
 */
function computeCharacterHash(character: ElizaOSCharacter): string {
  const configString = JSON.stringify({
    name: character.name,
    system: character.system,
    bio: character.bio,
    modelProvider: character.modelProvider,
    settings: character.settings,
  });
  return '0x' + sha256(configString);
}

/**
 * Get runtime hashes from ElizaOS character
 */
function getCharacterHashes(character: ElizaOSCharacter) {
  return generateRuntimeHashes({
    fullConfig: character,
    systemPrompt: character.system,
    tools: character.plugins || [],
    model: {
      name: character.modelProvider || 'unknown',
    },
  });
}

/**
 * Register agent with AgentID
 */
async function registerAgent(
  character: ElizaOSCharacter,
  config: AgentIDPluginConfig
): Promise<{ identityHash: string; keys: { publicKey: string; privateKey: string } }> {
  const apiUrl = config.apiUrl || 'https://api.id-agent.org';

  // Generate keys if not provided
  const keys = config.privateKey && config.publicKey
    ? { privateKey: config.privateKey, publicKey: config.publicKey }
    : generateKeyPair();

  // Compute identity hash
  const identityHash = config.identityHash || computeCharacterHash(character);

  // Register with API
  const response = await fetch(`${apiUrl}/api/v2/agents/self-register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      publicKey: keys.publicKey,
      agentName: character.name,
      platform: 'elizaos',
      config: {
        name: character.name,
        system: character.system,
        modelProvider: character.modelProvider,
      },
    }),
  });

  const result = await response.json() as {
    success: boolean;
    data?: { identityHash: string };
    error?: { message: string };
  };

  if (!response.ok || !result.success) {
    throw new Error(result.error?.message || 'Registration failed');
  }

  return {
    identityHash: result.data?.identityHash || identityHash,
    keys,
  };
}

// =============================================================================
// ACTIONS
// =============================================================================

const verifyIdentityAction = {
  name: 'VERIFY_IDENTITY',
  description: 'Verify this agent\'s identity on AgentID',
  similes: ['check identity', 'verify agent', 'prove identity', 'attestation'],

  validate: async () => {
    return attestor !== null;
  },

  handler: async () => {
    if (!attestor) {
      return {
        success: false,
        message: 'AgentID not initialized. Agent needs to be registered first.',
      };
    }

    try {
      const drift = await attestor.selfVerify();
      return {
        success: true,
        message: `Identity verified. Drift score: ${(drift.driftScore * 100).toFixed(1)}%`,
        data: {
          identityHash: registeredIdentityHash,
          driftScore: drift.driftScore,
          configMatch: drift.configMatch,
          isLive: true,
        },
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Verification failed: ${error.message}`,
      };
    }
  },

  examples: [
    [
      { user: 'user', content: { text: 'Can you verify your identity?' } },
      { user: 'agent', content: { text: 'I\'ll verify my identity on AgentID now.' } },
    ],
  ],
};

const getIdentityAction = {
  name: 'GET_IDENTITY',
  description: 'Get this agent\'s AgentID identity hash',
  similes: ['what is your identity', 'identity hash', 'agent id', 'who are you'],

  validate: async () => true,

  handler: async () => {
    if (!registeredIdentityHash) {
      return {
        success: false,
        message: 'This agent has not been registered with AgentID yet.',
      };
    }

    const status = attestor ? await attestor.getStatus() : null;

    return {
      success: true,
      message: `My AgentID identity hash is: ${registeredIdentityHash}`,
      data: {
        identityHash: registeredIdentityHash,
        verifyUrl: `https://id-agent.org/verify/${registeredIdentityHash}`,
        isLive: status?.isLive || false,
        attestationCount: status?.attestationCount || 0,
        trustBonus: status?.trustBonus || 0,
      },
    };
  },

  examples: [
    [
      { user: 'user', content: { text: 'What is your identity hash?' } },
      { user: 'agent', content: { text: 'My AgentID identity hash is 0x...' } },
    ],
  ],
};

// =============================================================================
// PLUGIN FACTORY
// =============================================================================

/**
 * Create AgentID plugin for ElizaOS
 */
export function agentidPlugin(config: AgentIDPluginConfig = {}): ElizaOSPlugin {
  return {
    name: 'agentid',
    description: 'AgentID identity verification and runtime attestation',

    actions: [
      verifyIdentityAction,
      getIdentityAction,
    ],

    services: [
      {
        name: 'agentid-service',

        async initialize(runtime: ElizaOSRuntime) {
          console.log('[AgentID] Initializing plugin...');

          try {
            const character = runtime.character;

            // Check for existing keys in environment/settings
            let identityHash = config.identityHash || runtime.getSetting('AGENTID_IDENTITY_HASH');
            let privateKey = config.privateKey || runtime.getSetting('AGENTID_PRIVATE_KEY');
            let publicKey = config.publicKey || runtime.getSetting('AGENTID_PUBLIC_KEY');

            // Auto-register if enabled and not already registered
            if (config.autoRegister && !identityHash) {
              console.log('[AgentID] Auto-registering agent...');

              const registration = await registerAgent(character, config);
              identityHash = registration.identityHash;
              privateKey = registration.keys.privateKey;
              publicKey = registration.keys.publicKey;

              console.log('[AgentID] Registered with hash:', identityHash);

              if (config.onRegistered) {
                config.onRegistered(identityHash, registration.keys);
              }

              // Persist keys if enabled
              if (config.persistKeys) {
                console.log('[AgentID] Keys should be persisted:');
                console.log(`  AGENTID_IDENTITY_HASH=${identityHash}`);
                console.log(`  AGENTID_PUBLIC_KEY=${publicKey}`);
                console.log(`  AGENTID_PRIVATE_KEY=${privateKey}`);
              }
            }

            // Create attestor if we have keys
            if (identityHash && privateKey && publicKey) {
              registeredIdentityHash = identityHash;

              attestor = new RuntimeAttestor({
                identityHash,
                privateKey,
                publicKey,
                apiUrl: config.apiUrl,
                getConfig: () => ({
                  fullConfig: character,
                  systemPrompt: character.system,
                  tools: character.plugins || [],
                  model: { name: character.modelProvider || 'unknown' },
                  platform: 'elizaos',
                }),
                selfVerifyInterval: config.selfVerifyInterval,
              });

              // Event handling
              attestor.on((event) => {
                if (event.type === 'self_verify_complete' && config.onAttested) {
                  config.onAttested(event.drift.driftScore);
                }
                if (event.type === 'error' && config.onError) {
                  config.onError(new Error(event.error));
                }
              });

              console.log('[AgentID] Attestor initialized');

              // Initial self-verify
              if (config.selfVerifyInterval) {
                try {
                  const drift = await attestor.selfVerify();
                  console.log('[AgentID] Initial verification - drift:', drift.driftScore);
                } catch (e) {
                  console.warn('[AgentID] Initial verification failed:', e);
                }
              }
            } else {
              console.log('[AgentID] No keys configured. Set autoRegister: true or provide keys.');
            }

          } catch (error: any) {
            console.error('[AgentID] Initialization error:', error.message);
            if (config.onError) {
              config.onError(error);
            }
          }
        },

        async cleanup() {
          if (attestor) {
            attestor.destroy();
            attestor = null;
          }
          registeredIdentityHash = null;
          console.log('[AgentID] Plugin cleaned up');
        },
      },
    ],
  };
}

// =============================================================================
// EXPORTS
// =============================================================================

export {
  attestor,
  registeredIdentityHash,
  computeCharacterHash,
  getCharacterHashes,
  registerAgent,
};

export default agentidPlugin;
