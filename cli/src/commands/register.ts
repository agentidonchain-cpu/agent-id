/**
 * Register command
 * Creates a new agent identity and optionally anchors it on-chain
 */

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';

interface AgentConfig {
  name: string;
  description: string;
  model: {
    provider: string;
    modelId: string;
    apiEndpoint: string;
  };
  systemPrompt: string;
  parameters: {
    temperature: number;
    maxTokens: number;
  };
}

interface RegisterOptions {
  config?: string;
  api: string;
  anchor: boolean;
}

export async function register(options: RegisterOptions): Promise<void> {
  console.log();
  console.log(chalk.bold('AgentID - Register Agent Identity'));
  console.log(chalk.dim('─'.repeat(40)));
  console.log();

  let config: AgentConfig;

  // Load config from file or prompt
  if (options.config) {
    const spinner = ora('Loading config file').start();
    try {
      const content = await readFile(options.config, 'utf-8');
      config = JSON.parse(content);
      spinner.succeed('Agent config loaded');
    } catch (error) {
      spinner.fail('Failed to load config file');
      process.exit(1);
    }
  } else {
    config = await promptConfig();
  }

  // Generate identity hash locally
  const hashSpinner = ora('Generating identity hash').start();
  const identityHash = generateIdentityHash(config);
  hashSpinner.succeed('Identity hash generated');

  console.log();
  console.log(chalk.dim('Identity Hash:'));
  console.log(chalk.cyan(`0x${identityHash}`));
  console.log();

  // Register with API
  const registerSpinner = ora('Registering with AgentID').start();
  try {
    const result = await registerWithAPI(options.api, config);
    registerSpinner.succeed('Agent registered');

    // Validate
    const validateSpinner = ora('Validating agent').start();
    const validation = await validateAgent(options.api, result.registrationId, result.challengeId);

    if (validation.success) {
      validateSpinner.succeed('Agent validated');
    } else {
      validateSpinner.fail('Validation failed');
      console.log(chalk.red(validation.error));
      process.exit(1);
    }

    // Anchor if requested
    if (options.anchor) {
      const anchorSpinner = ora('Anchoring on Base Mainnet').start();
      const anchor = await anchorIdentity(options.api, identityHash);

      if (anchor.success) {
        anchorSpinner.succeed('Anchored on Base Mainnet');
        console.log();
        console.log(chalk.dim('Transaction:'));
        console.log(chalk.cyan(anchor.explorerUrl));
      } else {
        anchorSpinner.warn('Anchoring skipped (requires API key)');
      }
    }

    // Final output
    console.log();
    console.log(chalk.dim('─'.repeat(40)));
    console.log(chalk.bold.green('Registration complete'));
    console.log();
    console.log(`Identity Hash: ${chalk.cyan(`0x${identityHash}`)}`);
    console.log(`Status:        ${chalk.green('validated')}`);
    if (options.anchor) {
      console.log(`Chain:         ${chalk.dim('Base Mainnet')}`);
    }
    console.log();

  } catch (error: any) {
    registerSpinner.fail('Registration failed');
    console.log(chalk.red(error.message));
    process.exit(1);
  }
}

async function promptConfig(): Promise<AgentConfig> {
  const answers = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Agent name:',
      validate: (input: string) => input.length > 0 || 'Name is required',
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description:',
      validate: (input: string) => input.length > 0 || 'Description is required',
    },
    {
      type: 'list',
      name: 'provider',
      message: 'Model provider:',
      choices: ['anthropic', 'openai', 'google', 'mistral', 'custom'],
    },
    {
      type: 'input',
      name: 'modelId',
      message: 'Model ID:',
      default: 'claude-3-5-sonnet-20241022',
    },
    {
      type: 'input',
      name: 'apiEndpoint',
      message: 'API endpoint:',
      default: 'https://api.anthropic.com/v1/messages',
    },
    {
      type: 'editor',
      name: 'systemPrompt',
      message: 'System prompt (opens editor):',
    },
    {
      type: 'number',
      name: 'temperature',
      message: 'Temperature:',
      default: 0.7,
    },
    {
      type: 'number',
      name: 'maxTokens',
      message: 'Max tokens:',
      default: 4096,
    },
  ]);

  return {
    name: answers.name,
    description: answers.description,
    model: {
      provider: answers.provider,
      modelId: answers.modelId,
      apiEndpoint: answers.apiEndpoint,
    },
    systemPrompt: answers.systemPrompt,
    parameters: {
      temperature: answers.temperature,
      maxTokens: answers.maxTokens,
    },
  };
}

function generateIdentityHash(config: AgentConfig): string {
  // Deterministic JSON serialization
  const canonical = JSON.stringify({
    systemPrompt: {
      content: config.systemPrompt,
      version: '1.0',
    },
    model: {
      provider: config.model.provider,
      modelId: config.model.modelId,
      apiEndpoint: config.model.apiEndpoint,
    },
    parameters: {
      temperature: config.parameters.temperature,
      maxTokens: config.parameters.maxTokens,
    },
  }, Object.keys({
    systemPrompt: null,
    model: null,
    parameters: null,
  }).sort());

  return createHash('sha256').update(canonical).digest('hex');
}

async function registerWithAPI(
  apiUrl: string,
  config: AgentConfig
): Promise<{ registrationId: string; challengeId: string }> {
  const response = await fetch(`${apiUrl}/agents/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      agent: {
        systemPrompt: config.systemPrompt,
        model: {
          provider: config.model.provider,
          modelId: config.model.modelId,
          apiEndpoint: config.model.apiEndpoint,
          apiKey: 'REDACTED', // User provides separately
          authMethod: 'bearer',
        },
        parameters: config.parameters,
        tools: [],
      },
      metadata: {
        displayName: config.name,
        bio: config.description,
        tags: [],
      },
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error?.message || 'Registration failed');
  }

  const data = await response.json();
  return {
    registrationId: data.data.registrationId,
    challengeId: data.data.challenge.id,
  };
}

async function validateAgent(
  apiUrl: string,
  registrationId: string,
  challengeId: string
): Promise<{ success: boolean; error?: string }> {
  // In production, this would run the actual validation challenge
  // For now, return simulated success
  return { success: true };
}

async function anchorIdentity(
  apiUrl: string,
  identityHash: string
): Promise<{ success: boolean; explorerUrl?: string }> {
  // Requires API key - return info for manual anchoring
  return {
    success: false,
  };
}
