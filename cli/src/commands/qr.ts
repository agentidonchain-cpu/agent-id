/**
 * QR Command - Generate QR code for agent verification
 *
 * Usage:
 *   npx agentidbase qr <identityHash>
 *   npx agentidbase qr 0x123... --output custom-name.png
 *   npx agentidbase qr 0x123... --size 512
 */

import QRCode from 'qrcode';
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

interface QROptions {
  output?: string;
  size?: string;
  dir?: string;
}

const SITE_URL = 'https://id-agent.org';

export async function qr(identityHash: string, options: QROptions) {
  console.log();
  console.log(chalk.bold.green('╔════════════════════════════════════════════════════════════╗'));
  console.log(chalk.bold.green('║') + chalk.bold('           AgentID - Generate Verification QR Code          ') + chalk.bold.green('║'));
  console.log(chalk.bold.green('╚════════════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.white('This generates a QR code that links to your agent\'s verification page.'));
  console.log(chalk.white('Anyone who scans it can instantly verify your agent on the blockchain.'));
  console.log();
  console.log(chalk.dim('─'.repeat(60)));
  console.log();

  const spinner = ora('Generating QR code...').start();

  try {
    // Validate hash format
    if (!identityHash || !identityHash.startsWith('0x')) {
      spinner.fail('Invalid identity hash format');
      console.log(chalk.yellow('\nHash must start with "0x"'));
      process.exit(1);
    }

    // Generate verify URL
    const verifyUrl = `${SITE_URL}/verify/${identityHash}`;
    const qrSize = parseInt(options.size || '512', 10);

    // Determine output path
    const outputDir = options.dir || process.cwd();
    const defaultFilename = `agent-${identityHash.slice(0, 8)}.png`;
    const filename = options.output || defaultFilename;
    const outputPath = resolve(outputDir, filename);

    // Check if file exists
    if (existsSync(outputPath)) {
      spinner.warn('File already exists');
      console.log(chalk.yellow(`\nFile exists: ${outputPath}`));
      console.log(chalk.gray('Use --output to specify a different name\n'));
      process.exit(1);
    }

    spinner.text = 'Generating QR code image...';

    // Generate QR code as PNG buffer
    const buffer = await QRCode.toBuffer(verifyUrl, {
      width: qrSize,
      margin: 2,
      color: {
        dark: '#000000',
        light: '#ffffff',
      },
      errorCorrectionLevel: 'H', // High error correction for better scanning
    });

    // Save to file
    writeFileSync(outputPath, buffer);

    spinner.succeed('QR code generated successfully!');

    // Success output
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold.green('╔════════════════════════════════════════════════════════════╗'));
    console.log(chalk.bold.green('║') + chalk.bold.green('             ✓ QR CODE GENERATED SUCCESSFULLY               ') + chalk.bold.green('║'));
    console.log(chalk.bold.green('╚════════════════════════════════════════════════════════════╝'));
    console.log();
    console.log(chalk.bold('QR Code Details:'));
    console.log();
    console.log(chalk.dim('  Identity Hash: ') + chalk.cyan(identityHash));
    console.log(chalk.dim('  Verify URL:    ') + chalk.white(verifyUrl));
    console.log(chalk.dim('  Image Size:    ') + chalk.white(`${qrSize}x${qrSize} pixels`));
    console.log(chalk.dim('  Saved to:      ') + chalk.white(outputPath));
    console.log();
    console.log(chalk.dim('─'.repeat(60)));
    console.log();
    console.log(chalk.bold('How to use this QR code:'));
    console.log();
    console.log(chalk.white('  1. ') + chalk.dim('Include it in your agent\'s UI or documentation'));
    console.log(chalk.white('  2. ') + chalk.dim('Users scan it to verify your agent on id-agent.org'));
    console.log(chalk.white('  3. ') + chalk.dim('Verification is performed directly on Base blockchain'));
    console.log();

    // Print QR code to terminal (ASCII version)
    try {
      const terminalQR = await QRCode.toString(verifyUrl, {
        type: 'terminal',
        errorCorrectionLevel: 'L',
        small: true,
      });
      console.log(chalk.gray('Terminal Preview:'));
      console.log(terminalQR);
    } catch (e) {
      // Terminal QR generation failed, skip preview
    }

  } catch (error) {
    spinner.fail('Failed to generate QR code');

    if (error instanceof Error) {
      console.log(chalk.red(`\n✗ Error: ${error.message}`));
    } else {
      console.log(chalk.red('\n✗ Unknown error occurred'));
    }

    console.log(chalk.gray('\nPlease check:'));
    console.log(chalk.gray('  • Identity hash is valid'));
    console.log(chalk.gray('  • You have write permissions'));
    console.log(chalk.gray('  • Output directory exists\n'));

    process.exit(1);
  }
}

/**
 * Validate identity hash format
 */
function isValidHash(hash: string): boolean {
  return /^0x[a-fA-F0-9]{64}$/.test(hash);
}
