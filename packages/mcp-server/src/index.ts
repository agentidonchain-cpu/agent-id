#!/usr/bin/env node
/**
 * @agentid/mcp-server
 *
 * MCP Server for AgentID - Provides identity verification tools
 * for MCP-compatible agents like OpenClaw, Claude, etc.
 *
 * Usage:
 *   npx @agentid/mcp-server
 *
 * Or add to MCP config:
 *   {
 *     "mcpServers": {
 *       "agentid": {
 *         "command": "npx",
 *         "args": ["@agentid/mcp-server"]
 *       }
 *     }
 *   }
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';
import {
  RuntimeAttestor,
  generateKeyPair,
  generateRuntimeHashes,
  sha256,
} from '@agentid/runtime-sdk';

// =============================================================================
// CONFIGURATION
// =============================================================================

const API_URL = process.env.AGENTID_API_URL || 'https://api.id-agent.org';

// Agent state (persisted in memory for session)
let currentAttestor: RuntimeAttestor | null = null;
let currentIdentityHash: string | null = null;
let currentKeys: { publicKey: string; privateKey: string } | null = null;

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

const tools: Tool[] = [
  {
    name: 'agentid_register',
    description: 'Register this agent with AgentID to get a verifiable identity. Returns identity hash and keys that should be stored securely.',
    inputSchema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Agent name',
        },
        systemPrompt: {
          type: 'string',
          description: 'The agent\'s system prompt or character definition',
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: 'List of tool names the agent has access to',
        },
        model: {
          type: 'string',
          description: 'Model name (e.g., claude-3-opus, gpt-4)',
        },
        platform: {
          type: 'string',
          description: 'Platform name (e.g., openclaw, custom)',
          default: 'mcp',
        },
      },
      required: ['name'],
    },
  },
  {
    name: 'agentid_verify',
    description: 'Verify an agent identity hash on the AgentID registry. Use this to check if another agent is registered and trusted.',
    inputSchema: {
      type: 'object',
      properties: {
        identityHash: {
          type: 'string',
          description: 'The 0x-prefixed 64-character identity hash to verify',
        },
      },
      required: ['identityHash'],
    },
  },
  {
    name: 'agentid_attest',
    description: 'Generate a runtime attestation proving current configuration matches registered identity. Requires prior registration.',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Current agent configuration to attest',
          properties: {
            systemPrompt: { type: 'string' },
            tools: { type: 'array', items: { type: 'string' } },
            model: { type: 'string' },
          },
        },
      },
      required: ['config'],
    },
  },
  {
    name: 'agentid_status',
    description: 'Get the attestation status for a registered agent. Shows if agent is "live" (recently attested) and trust score.',
    inputSchema: {
      type: 'object',
      properties: {
        identityHash: {
          type: 'string',
          description: 'Identity hash to check status for. If omitted, uses current agent.',
        },
      },
    },
  },
  {
    name: 'agentid_hash',
    description: 'Compute identity hash and runtime hashes for a given configuration. Useful for comparing configs.',
    inputSchema: {
      type: 'object',
      properties: {
        config: {
          type: 'object',
          description: 'Configuration to hash',
        },
        systemPrompt: {
          type: 'string',
          description: 'System prompt to hash separately',
        },
        tools: {
          type: 'array',
          items: { type: 'string' },
          description: 'Tool list to hash',
        },
        model: {
          type: 'object',
          description: 'Model info { name, version, endpoint }',
        },
      },
      required: ['config'],
    },
  },
  {
    name: 'agentid_get_identity',
    description: 'Get the current agent\'s registered identity hash and verification URL.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

// =============================================================================
// TOOL HANDLERS
// =============================================================================

async function handleRegister(args: {
  name: string;
  systemPrompt?: string;
  tools?: string[];
  model?: string;
  platform?: string;
}): Promise<string> {
  try {
    // Generate keys
    const keys = generateKeyPair();

    // Create config for hashing
    const config = {
      name: args.name,
      systemPrompt: args.systemPrompt || '',
      tools: args.tools || [],
      model: args.model || 'unknown',
      platform: args.platform || 'mcp',
    };

    // Register with API
    const response = await fetch(`${API_URL}/api/v2/agents/self-register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        publicKey: keys.publicKey,
        agentName: args.name,
        platform: args.platform || 'mcp',
        config,
      }),
    });

    const result = await response.json() as {
      success: boolean;
      data?: { identityHash: string };
      error?: { message: string };
    };

    if (!response.ok || !result.success) {
      return JSON.stringify({
        success: false,
        error: result.error?.message || 'Registration failed',
      });
    }

    const identityHash = result.data!.identityHash;

    // Store state
    currentIdentityHash = identityHash;
    currentKeys = keys;

    // Create attestor
    currentAttestor = new RuntimeAttestor({
      identityHash,
      privateKey: keys.privateKey,
      publicKey: keys.publicKey,
      apiUrl: API_URL,
      getConfig: () => ({
        fullConfig: config,
        systemPrompt: args.systemPrompt,
        tools: args.tools,
        model: { name: args.model || 'unknown' },
        platform: args.platform || 'mcp',
      }),
    });

    return JSON.stringify({
      success: true,
      identityHash,
      publicKey: keys.publicKey,
      privateKey: keys.privateKey,
      verifyUrl: `https://id-agent.org/verify/${identityHash}`,
      message: 'IMPORTANT: Save the privateKey securely. You will need it for future attestations.',
    });
  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: error.message,
    });
  }
}

async function handleVerify(args: { identityHash: string }): Promise<string> {
  try {
    const response = await fetch(`${API_URL}/api/v2/agents/${args.identityHash}`);
    const result = await response.json() as {
      success: boolean;
      data?: any;
      error?: { message: string };
    };

    if (!response.ok || !result.success) {
      return JSON.stringify({
        success: false,
        verified: false,
        error: result.error?.message || 'Agent not found',
      });
    }

    const data = result.data;

    return JSON.stringify({
      success: true,
      verified: true,
      agent: {
        identityHash: args.identityHash,
        name: data.agentName,
        platform: data.platform,
        identityType: data.identityType,
        trustScore: data.trustScore,
        onChain: !!data.anchor,
        createdAt: data.createdAt,
      },
      verifyUrl: `https://id-agent.org/verify/${args.identityHash}`,
    });
  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: error.message,
    });
  }
}

async function handleAttest(args: { config: any }): Promise<string> {
  if (!currentAttestor || !currentIdentityHash) {
    return JSON.stringify({
      success: false,
      error: 'Agent not registered. Use agentid_register first.',
    });
  }

  try {
    const drift = await currentAttestor.selfVerify();

    return JSON.stringify({
      success: true,
      identityHash: currentIdentityHash,
      drift: {
        score: drift.driftScore,
        percentage: `${(drift.driftScore * 100).toFixed(1)}%`,
        configMatch: drift.configMatch,
        overallMatch: drift.overallMatch,
      },
      isLive: true,
      message: drift.overallMatch
        ? 'Configuration matches registered identity.'
        : 'Configuration has drifted from registered identity.',
    });
  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: error.message,
    });
  }
}

async function handleStatus(args: { identityHash?: string }): Promise<string> {
  const hash = args.identityHash || currentIdentityHash;

  if (!hash) {
    return JSON.stringify({
      success: false,
      error: 'No identity hash provided and agent not registered.',
    });
  }

  try {
    const response = await fetch(`${API_URL}/api/v1/runtime/status/${hash}`);
    const result = await response.json() as {
      success: boolean;
      data?: any;
      error?: { message: string };
    };

    if (!response.ok || !result.success) {
      return JSON.stringify({
        success: false,
        error: result.error?.message || 'Status not found',
      });
    }

    return JSON.stringify({
      success: true,
      status: result.data,
    });
  } catch (error: any) {
    return JSON.stringify({
      success: false,
      error: error.message,
    });
  }
}

async function handleHash(args: {
  config: any;
  systemPrompt?: string;
  tools?: string[];
  model?: { name: string; version?: string; endpoint?: string };
}): Promise<string> {
  const hashes = generateRuntimeHashes({
    fullConfig: args.config,
    systemPrompt: args.systemPrompt,
    tools: args.tools,
    model: args.model,
  });

  const identityHash = '0x' + sha256(JSON.stringify(args.config));

  return JSON.stringify({
    success: true,
    identityHash,
    hashes,
  });
}

async function handleGetIdentity(): Promise<string> {
  if (!currentIdentityHash) {
    return JSON.stringify({
      success: false,
      registered: false,
      message: 'Agent not registered. Use agentid_register to get an identity.',
    });
  }

  return JSON.stringify({
    success: true,
    registered: true,
    identityHash: currentIdentityHash,
    publicKey: currentKeys?.publicKey,
    verifyUrl: `https://id-agent.org/verify/${currentIdentityHash}`,
  });
}

// =============================================================================
// SERVER SETUP
// =============================================================================

const server = new Server(
  {
    name: 'agentid-mcp-server',
    version: '1.0.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// List tools handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools,
}));

// Call tool handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  let result: string;

  switch (name) {
    case 'agentid_register':
      result = await handleRegister(args as any);
      break;
    case 'agentid_verify':
      result = await handleVerify(args as any);
      break;
    case 'agentid_attest':
      result = await handleAttest(args as any);
      break;
    case 'agentid_status':
      result = await handleStatus(args as any);
      break;
    case 'agentid_hash':
      result = await handleHash(args as any);
      break;
    case 'agentid_get_identity':
      result = await handleGetIdentity();
      break;
    default:
      result = JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  return {
    content: [{ type: 'text', text: result }],
  };
});

// =============================================================================
// START SERVER
// =============================================================================

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('[AgentID MCP] Server running on stdio');
}

main().catch((error) => {
  console.error('[AgentID MCP] Fatal error:', error);
  process.exit(1);
});
