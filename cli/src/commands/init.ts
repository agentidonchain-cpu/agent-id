/**
 * Init command
 * Creates an agent.json config file in the current directory
 */

import chalk from 'chalk';
import inquirer from 'inquirer';
import fs from 'fs';
import path from 'path';

interface InitOptions {
  force?: boolean;
}

export async function init(options: InitOptions): Promise<void> {
  const configPath = path.join(process.cwd(), 'agent.json');

  console.log();
  console.log(chalk.bold.green('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.green('║') + chalk.bold('           AgentID - Create Agent Configuration           ') + chalk.bold.green('║'));
  console.log(chalk.bold.green('╚════════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.white('This wizard will help you create an agent.json configuration file.'));
  console.log(chalk.white('This file defines your AI agent\'s identity for on-chain verification.'));
  console.log();
  console.log(chalk.dim('The configuration includes:'));
  console.log(chalk.dim('  • Agent name'));
  console.log(chalk.dim('  • Model provider and ID (e.g., Anthropic Claude, OpenAI GPT)'));
  console.log(chalk.dim('  • System prompt (optional - defines agent behavior)'));
  console.log();
  console.log(chalk.yellow('Note: Your system prompt will be hashed, not stored publicly.'));
  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  // Check if file exists
  if (fs.existsSync(configPath) && !options.force) {
    console.log(chalk.yellow('⚠  agent.json already exists in this directory.'));
    console.log();
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Do you want to overwrite the existing file?',
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log();
      console.log(chalk.dim('Operation cancelled. Your existing file was not modified.'));
      console.log();
      return;
    }
    console.log();
  }

  // Step 1: Basic Info
  console.log(chalk.bold.cyan('STEP 1/3: Agent Name'));
  console.log(chalk.dim('What is your agent called?'));
  console.log();

  const basicInfo = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Agent name:',
      validate: (input: string) => input.length > 0 || 'Name is required.',
    },
  ]);

  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  // Step 2: Model Configuration
  console.log(chalk.bold.cyan('STEP 2/3: Model'));
  console.log(chalk.dim('Which AI model does your agent use?'));
  console.log();

  const modelInfo = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Provider:',
      choices: [
        { name: 'Anthropic (Claude)', value: 'anthropic' },
        { name: 'OpenAI (GPT)', value: 'openai' },
        { name: 'Google (Gemini)', value: 'google' },
        { name: 'Mistral', value: 'mistral' },
        { name: 'Other', value: 'other' },
      ],
    },
    {
      type: 'input',
      name: 'modelId',
      message: 'Model ID:',
      default: (ans: { provider: string }) => {
        const defaults: Record<string, string> = {
          anthropic: 'claude-sonnet-4-20250514',
          openai: 'gpt-4o',
          google: 'gemini-2.0-flash',
          mistral: 'mistral-large-latest',
        };
        return defaults[ans.provider] || '';
      },
    },
  ]);

  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  // Step 3: System Prompt (optional)
  console.log(chalk.bold.cyan('STEP 3/3: System Prompt (optional)'));
  console.log(chalk.dim('The system prompt defines your agent\'s behavior.'));
  console.log(chalk.dim('Press Enter to skip, or edit agent.json later.'));
  console.log();

  const promptInfo = await inquirer.prompt([
    {
      type: 'input',
      name: 'systemPrompt',
      message: 'System prompt:',
      default: '',
    },
  ]);

  // Use defaults for technical params
  const paramInfo = { temperature: 0.7, maxTokens: 4096 };

  // Build config
  const config: Record<string, any> = {
    name: basicInfo.name,
    model: {
      provider: modelInfo.provider,
      modelId: modelInfo.modelId,
    },
  };

  // Only add systemPrompt if provided
  if (promptInfo.systemPrompt && promptInfo.systemPrompt.trim()) {
    config.systemPrompt = promptInfo.systemPrompt;
  }

  // Add default parameters (not shown to user)
  config.parameters = {
    temperature: paramInfo.temperature,
    maxTokens: paramInfo.maxTokens,
  };

  // Write file
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.green('✓ SUCCESS: agent.json created!'));
  console.log();
  console.log(chalk.white('File saved to: ') + chalk.cyan(configPath));
  console.log();
  console.log(chalk.bold('Configuration:'));
  console.log(chalk.dim('  Name:     ') + chalk.white(config.name));
  console.log(chalk.dim('  Provider: ') + chalk.white(config.model.provider));
  console.log(chalk.dim('  Model:    ') + chalk.white(config.model.modelId));
  if (config.systemPrompt) {
    console.log(chalk.dim('  Prompt:   ') + chalk.white(config.systemPrompt.slice(0, 50) + (config.systemPrompt.length > 50 ? '...' : '')));
  }
  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.yellow('NEXT STEPS:'));
  console.log();
  console.log(chalk.white('  1. ') + chalk.dim('Review and edit ') + chalk.cyan('agent.json') + chalk.dim(' if needed'));
  console.log(chalk.dim('     (especially the system prompt for complex agents)'));
  console.log();
  console.log(chalk.white('  2. ') + chalk.dim('Register your agent (FREE - we pay the blockchain fees):'));
  console.log(chalk.cyan('     npx agentidbase register --config agent.json'));
  console.log();
  console.log(chalk.dim('     This will:'));
  console.log(chalk.dim('     • Generate your unique identity hash'));
  console.log(chalk.dim('     • Anchor it on Base blockchain (free!)'));
  console.log(chalk.dim('     • Give you a verification link to share'));
  console.log();
  console.log(chalk.dim('For help: ') + chalk.cyan('npx agentidbase --help'));
  console.log();
}
