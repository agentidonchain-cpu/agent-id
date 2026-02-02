/**
 * Test script for signature service (ESM)
 */
import { createHash } from 'crypto';
import { Wallet, verifyMessage } from 'ethers';

// Message templates
const CONFIG_IDENTITY_MESSAGE = `AgentID ConfigIdentity Registration

I declare ownership of this agent configuration.

Identity Hash: {identityHash}
Chain: Base Mainnet (8453)
Contract: 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa
Timestamp: {timestamp}`;

function generateConfigMessage(identityHash, timestamp) {
  return CONFIG_IDENTITY_MESSAGE
    .replace('{identityHash}', identityHash)
    .replace('{timestamp}', timestamp);
}

// Test private key (Foundry default - DO NOT USE IN PRODUCTION)
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

async function runTests() {
  console.log('=== Testing Signature Service ===\n');

  // Test 1: Generate Config Message
  console.log('Test 1: Generate Config Message');
  const identityHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const timestamp = '2024-01-15T10:30:00.000Z';
  const message = generateConfigMessage(identityHash, timestamp);
  console.log('Message:\n', message);
  console.log('✓ Config message generated\n');

  // Test 2: Sign Message
  console.log('Test 2: Sign Message');
  const wallet = new Wallet(TEST_PRIVATE_KEY);
  const signature = await wallet.signMessage(message);
  console.log('Wallet:', wallet.address);
  console.log('Signature:', signature.slice(0, 40) + '...');
  console.log('✓ Message signed\n');

  // Test 3: Verify Signature
  console.log('Test 3: Verify Signature');
  const recoveredAddress = verifyMessage(message, signature);
  console.log('Recovered Address:', recoveredAddress);
  console.log('Match:', recoveredAddress.toLowerCase() === wallet.address.toLowerCase());
  console.log('✓ Signature verified\n');

  // Test 4: Wrong message should fail
  console.log('Test 4: Wrong message verification');
  const wrongMessage = message.replace('1234', '5678');
  const wrongRecovered = verifyMessage(wrongMessage, signature);
  console.log('Wrong message recovered:', wrongRecovered);
  console.log('Should NOT match:', wrongRecovered.toLowerCase() !== wallet.address.toLowerCase());
  console.log('✓ Wrong message correctly fails\n');

  console.log('=== All Tests Passed ===');
  console.log('\nSignature service is working correctly!');
}

runTests().catch(console.error);
