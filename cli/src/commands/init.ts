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
  console.log(chalk.dim('  • Agent name and description'));
  console.log(chalk.dim('  • Model provider and ID (e.g., Anthropic Claude, OpenAI GPT)'));
  console.log(chalk.dim('  • System prompt (the instructions that define agent behavior)'));
  console.log(chalk.dim('  • Generation parameters (temperature, max tokens)'));
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
  console.log(chalk.bold.cyan('STEP 1/4: Basic Information'));
  console.log(chalk.dim('Enter a name and description for your agent.'));
  console.log();

  const basicInfo = await inquirer.prompt([
    {
      type: 'input',
      name: 'name',
      message: 'Agent name (e.g., "CustomerSupportBot"):',
      validate: (input: string) => input.length > 0 || 'Name is required. Please enter a name for your agent.',
    },
    {
      type: 'input',
      name: 'description',
      message: 'Description (what does this agent do?):',
      default: 'An AI assistant',
    },
  ]);

  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  // Step 2: Model Configuration
  console.log(chalk.bold.cyan('STEP 2/4: Model Configuration'));
  console.log(chalk.dim('Select the AI model provider and specific model your agent uses.'));
  console.log();

  const modelInfo = await inquirer.prompt([
    {
      type: 'list',
      name: 'provider',
      message: 'Which AI provider does your agent use?',
      choices: [
        { name: 'Anthropic (Claude)', value: 'anthropic' },
        { name: 'OpenAI (GPT)', value: 'openai' },
        { name: 'Google (Gemini)', value: 'google' },
        { name: 'Cohere (Command)', value: 'cohere' },
        { name: 'Other / Custom', value: 'other' },
      ],
    },
    {
      type: 'input',
      name: 'modelId',
      message: 'Model ID (the exact model name):',
      default: (ans: { provider: string }) => {
        const defaults: Record<string, string> = {
          anthropic: 'claude-3-5-sonnet-20241022',
          openai: 'gpt-4-turbo',
          google: 'gemini-pro',
          cohere: 'command-r-plus',
        };
        return defaults[ans.provider] || 'your-model-id';
      },
    },
  ]);

  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  // Step 3: System Prompt
  console.log(chalk.bold.cyan('STEP 3/4: System Prompt'));
  console.log(chalk.dim('The system prompt defines your agent\'s behavior and personality.'));
  console.log(chalk.dim('This is the core of your agent\'s identity.'));
  console.log();
  console.log(chalk.yellow('TIP: You can paste multi-line prompts. Press Enter twice when done,'));
  console.log(chalk.yellow('     or type a short prompt and edit agent.json later.'));
  console.log();

  const promptInfo = await inquirer.prompt([
    {
      type: 'input',
      name: 'systemPrompt',
      message: 'System prompt (or press Enter for default):',
      default: 'You are a helpful assistant.',
    },
  ]);

  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  // Step 4: Parameters
  console.log(chalk.bold.cyan('STEP 4/4: Generation Parameters'));
  console.log(chalk.dim('These parameters control how the AI generates responses.'));
  console.log();
  console.log(chalk.dim('  • Temperature: Controls randomness (0.0 = deterministic, 1.0 = creative)'));
  console.log(chalk.dim('  • Max Tokens: Maximum response length'));
  console.log();

  const paramInfo = await inquirer.prompt([
    {
      type: 'number',
      name: 'temperature',
      message: 'Temperature (0.0 - 1.0):',
      default: 0.7,
      validate: (input: number) => {
        if (isNaN(input)) return 'Please enter a number';
        if (input < 0 || input > 2) return 'Temperature should be between 0.0 and 2.0';
        return true;
      },
    },
    {
      type: 'number',
      name: 'maxTokens',
      message: 'Max tokens (e.g., 4096):',
      default: 4096,
      validate: (input: number) => {
        if (isNaN(input)) return 'Please enter a number';
        if (input < 1) return 'Max tokens must be at least 1';
        return true;
      },
    },
  ]);

  // Build config
  const config = {
    name: basicInfo.name,
    description: basicInfo.description || undefined,
    model: {
      provider: modelInfo.provider,
      modelId: modelInfo.modelId,
    },
    systemPrompt: promptInfo.systemPrompt,
    parameters: {
      temperature: paramInfo.temperature,
      maxTokens: paramInfo.maxTokens,
    },
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
  console.log(chalk.bold('Configuration Summary:'));
  console.log(chalk.dim('  Name:        ') + chalk.white(config.name));
  console.log(chalk.dim('  Provider:    ') + chalk.white(config.model.provider));
  console.log(chalk.dim('  Model:       ') + chalk.white(config.model.modelId));
  console.log(chalk.dim('  Temperature: ') + chalk.white(config.parameters.temperature));
  console.log(chalk.dim('  Max Tokens:  ') + chalk.white(config.parameters.maxTokens));
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
