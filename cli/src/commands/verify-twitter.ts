/**
 * Verify Twitter Command
 * Links a Twitter account to an AgentID identity
 */

import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import open from 'open';

interface VerifyTwitterOptions {
  identityHash?: string;
  tweetUrl?: string;
  api: string;
}

interface ChallengeResponse {
  challengeId: string;
  code: string;
  expiresAt: string;
  instructions: string;
  suggestedTweet: string;
}

export async function verifyTwitter(
  handle: string | undefined,
  options: VerifyTwitterOptions
): Promise<void> {
  console.log();
  console.log(chalk.bold.cyan('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.cyan('║') + chalk.bold('          AgentID - Twitter Verification                  ') + chalk.bold.cyan('║'));
  console.log(chalk.bold.cyan('╚════════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.white('Link your Twitter account to your agent identity.'));
  console.log();
  console.log(chalk.bold.yellow('What this proves:'));
  console.log(chalk.green('  ✓ ') + chalk.white('You controlled @handle when you registered'));
  console.log(chalk.green('  ✓ ') + chalk.white('You posted a public verification tweet'));
  console.log();
  console.log(chalk.bold.yellow('What this does NOT prove:'));
  console.log(chalk.red('  ✗ ') + chalk.dim('That the account will always be yours'));
  console.log(chalk.red('  ✗ ') + chalk.dim('That the tweet will remain online'));
  console.log(chalk.red('  ✗ ') + chalk.dim('Your real-world identity'));
  console.log();
  console.log(chalk.dim('This is a point-in-time verification snapshot.'));
  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  // Get identity hash
  let identityHash = options.identityHash;
  if (!identityHash) {
    const hashAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'identityHash',
        message: 'Agent identity hash:',
        validate: (input: string) => {
          if (!input) return 'Identity hash is required';
          if (!/^0x[a-fA-F0-9]{64}$/.test(input)) {
            return 'Invalid hash format. Must be 0x followed by 64 hex characters.';
          }
          return true;
        },
      },
    ]);
    identityHash = hashAnswer.identityHash;
  }

  // Get Twitter handle
  let twitterHandle = handle;
  if (!twitterHandle) {
    const handleAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'handle',
        message: 'Twitter handle (without @):',
        validate: (input: string) => {
          if (!input) return 'Twitter handle is required';
          const cleaned = input.replace(/^@/, '');
          if (!/^[a-zA-Z0-9_]{1,15}$/.test(cleaned)) {
            return 'Invalid Twitter handle format';
          }
          return true;
        },
      },
    ]);
    twitterHandle = handleAnswer.handle.replace(/^@/, '');
  } else {
    twitterHandle = twitterHandle.replace(/^@/, '');
  }

  console.log();
  console.log(chalk.bold.cyan('STEP 1: GENERATING VERIFICATION CHALLENGE'));
  console.log(chalk.dim('Creating a unique code for you to tweet...'));
  console.log();

  // Initialize verification challenge
  const initSpinner = ora('Requesting verification challenge...').start();

  let challenge: ChallengeResponse;
  try {
    const response = await fetch(`${options.api}/api/v1/verify/twitter/init`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        identityHash,
        handle: twitterHandle,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Request failed' } }));
      throw new Error(error.error?.message || error.message || 'Failed to initialize verification');
    }

    const data = await response.json();
    challenge = data.data;
    initSpinner.succeed('Verification challenge created');
  } catch (error: any) {
    initSpinner.fail('Failed to create verification challenge');
    console.log();
    console.log(chalk.red('Error: ' + error.message));
    console.log();
    console.log(chalk.dim('Make sure:'));
    console.log(chalk.dim('  • The identity hash exists in AgentID'));
    console.log(chalk.dim('  • You have internet connectivity'));
    console.log();
    process.exit(1);
  }

  // Display challenge
  console.log();
  console.log(chalk.bold('Challenge Code:'));
  console.log();
  console.log(chalk.bold.green(`  ${challenge.code}`));
  console.log();
  console.log(chalk.dim('Expires in: ') + chalk.yellow('15 minutes'));
  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.cyan('STEP 2: POST THE VERIFICATION TWEET'));
  console.log();
  console.log(chalk.white('Post a public tweet containing this code:'));
  console.log();
  console.log(chalk.dim('────────────────────────────────────────'));
  console.log(chalk.white(challenge.suggestedTweet));
  console.log(chalk.dim('────────────────────────────────────────'));
  console.log();

  // Ask if user wants to open Twitter
  const openTwitterAnswer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'openTwitter',
      message: 'Open Twitter to post the tweet?',
      default: true,
    },
  ]);

  if (openTwitterAnswer.openTwitter) {
    const tweetText = encodeURIComponent(challenge.suggestedTweet);
    const twitterUrl = `https://twitter.com/intent/tweet?text=${tweetText}`;

    console.log();
    console.log(chalk.dim('Opening Twitter...'));

    try {
      await open(twitterUrl);
    } catch {
      console.log(chalk.yellow('Could not open browser automatically.'));
      console.log(chalk.white('Please open this URL manually:'));
      console.log(chalk.cyan(`  ${twitterUrl}`));
    }
  }

  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();
  console.log(chalk.bold.cyan('STEP 3: CONFIRM VERIFICATION'));
  console.log();
  console.log(chalk.white('After posting the tweet, paste the tweet URL below.'));
  console.log();

  // Get tweet URL
  let tweetUrl = options.tweetUrl;
  if (!tweetUrl) {
    const urlAnswer = await inquirer.prompt([
      {
        type: 'input',
        name: 'tweetUrl',
        message: 'Tweet URL:',
        validate: (input: string) => {
          if (!input) return 'Tweet URL is required';
          try {
            const url = new URL(input);
            if (!url.hostname.includes('twitter.com') && !url.hostname.includes('x.com')) {
              return 'Must be a twitter.com or x.com URL';
            }
            if (!input.includes('/status/')) {
              return 'Invalid tweet URL format';
            }
            return true;
          } catch {
            return 'Invalid URL format';
          }
        },
      },
    ]);
    tweetUrl = urlAnswer.tweetUrl;
  }

  // Verify the tweet
  console.log();
  const verifySpinner = ora('Verifying tweet...').start();

  try {
    const response = await fetch(`${options.api}/api/v1/verify/twitter/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        challengeId: challenge.challengeId,
        tweetUrl,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error?.message || 'Verification failed');
    }

    if (!data.data?.verified) {
      throw new Error(data.error?.message || 'Tweet verification failed');
    }

    verifySpinner.succeed('Tweet verified successfully!');

    // Success output
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold.green('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.green('║') + chalk.bold.green('            ✓ TWITTER VERIFICATION COMPLETE                ') + chalk.bold.green('║'));
    console.log(chalk.bold.green('╚════════════════════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.bold('Verification Details:'));
    console.log(chalk.dim('  Twitter:     ') + chalk.cyan(data.data.twitter.handle));
    console.log(chalk.dim('  User ID:     ') + chalk.white(data.data.twitter.userId));
    console.log(chalk.dim('  Verified At: ') + chalk.white(new Date(data.data.twitter.verifiedAt).toLocaleString()));
    console.log(chalk.dim('  Proof:       ') + chalk.cyan(data.data.twitter.proofUrl));
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold.yellow('WHAT\'S NEXT:'));
    console.log();
    console.log(chalk.white('  1. ') + chalk.dim('View your agent\'s page with verification badge:'));
    console.log(chalk.cyan(`     https://id-agent.org/verify/${identityHash}`));
    console.log();
    console.log(chalk.white('  2. ') + chalk.dim('Your Twitter link will now appear in agent lookups'));
    console.log();
    console.log(chalk.dim('Note: Keep your verification tweet online to maintain proof.'));
    console.log();

  } catch (error: any) {
    verifySpinner.fail('Verification failed');
    console.log();
    console.log(chalk.red('Error: ' + error.message));
    console.log();
    console.log(chalk.dim('Common issues:'));
    console.log(chalk.dim('  • Tweet does not contain the verification code'));
    console.log(chalk.dim('  • Tweet is from a different account than specified'));
    console.log(chalk.dim('  • Tweet is not public'));
    console.log(chalk.dim('  • Challenge has expired (15 minute limit)'));
    console.log();
    console.log(chalk.yellow('To try again, run:'));
    console.log(chalk.cyan(`  npx agentidbase verify twitter ${twitterHandle} --identity-hash ${identityHash}`));
    console.log();
    process.exit(1);
  }
}

export default verifyTwitter;
