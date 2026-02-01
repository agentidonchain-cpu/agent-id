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
  console.log(chalk.bold('AgentID - Initialize Agent Config'));
  console.log(chalk.dim('─'.repeat(40)));
  console.log();

  // Check if file exists
  if (fs.existsSync(configPath) && !options.force) {
    console.log(chalk.yellow('agent.json already exists in this directory.'));
    const { overwrite } = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'overwrite',
        message: 'Overwrite existing file?',
        default: false,
      },
    ]);

    if (!overwrite) {
      console.log(chalk.dim('Aborted.'));
      return;
    }
  }

  // Gather info
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
      default: '',
    },
    {
      type: 'list',
      name: 'provider',
      message: 'Model provider:',
      choices: ['anthropic', 'openai', 'google', 'cohere', 'other'],
    },
    {
      type: 'input',
      name: 'modelId',
      message: 'Model ID:',
      default: (ans: { provider: string }) => {
        const defaults: Record<string, string> = {
          anthropic: 'claude-3-5-sonnet-20241022',
          openai: 'gpt-4-turbo',
          google: 'gemini-pro',
          cohere: 'command-r-plus',
        };
        return defaults[ans.provider] || '';
      },
    },
    {
      type: 'editor',
      name: 'systemPrompt',
      message: 'System prompt (opens editor):',
      default: 'You are a helpful assistant.',
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

  // Build config
  const config = {
    name: answers.name,
    description: answers.description || undefined,
    model: {
      provider: answers.provider,
      modelId: answers.modelId,
    },
    systemPrompt: answers.systemPrompt,
    parameters: {
      temperature: answers.temperature,
      maxTokens: answers.maxTokens,
    },
  };

  // Write file
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');

  console.log();
  console.log(chalk.green('Created agent.json'));
  console.log();
  console.log(chalk.dim('Next steps:'));
  console.log('  1. Review and edit agent.json');
  console.log('  2. Run: ' + chalk.cyan('npx agentid register'));
  console.log('  3. Run: ' + chalk.cyan('npx agentid anchor <hash>'));
  console.log();
}
