/**
 * Test script for signature service
 */
import {
  generateConfigMessage,
  generateAttestationMessage,
  signMessage,
  verifySignature,
  createConfigSignature,
  verifyConfigSignature,
} from './src/services/security/signature.js';

// Test private key (DO NOT USE IN PRODUCTION - this is just for testing)
const TEST_PRIVATE_KEY = '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';

async function runTests() {
  console.log('=== Testing Signature Service ===\n');

  // Test 1: Generate Config Message
  console.log('Test 1: Generate Config Message');
  const identityHash = '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
  const timestamp = '2024-01-15T10:30:00.000Z';
  const message = generateConfigMessage({ identityHash, timestamp });
  console.log('Message:\n', message);
  console.log('✓ Config message generated\n');

  // Test 2: Sign Message
  console.log('Test 2: Sign Message');
  const { signature, walletAddress } = await signMessage(message, TEST_PRIVATE_KEY);
  console.log('Wallet:', walletAddress);
  console.log('Signature:', signature.slice(0, 20) + '...');
  console.log('✓ Message signed\n');

  // Test 3: Verify Signature
  console.log('Test 3: Verify Signature');
  const verification = await verifySignature(message, signature);
  console.log('Valid:', verification.valid);
  console.log('Recovered Address:', verification.recoveredAddress);
  console.log('Match:', verification.recoveredAddress === walletAddress.toLowerCase());
  console.log('✓ Signature verified\n');

  // Test 4: Full Config Signature Flow
  console.log('Test 4: Full Config Signature Flow');
  const signatureData = await createConfigSignature(identityHash, TEST_PRIVATE_KEY);
  console.log('Signature Data:', {
    walletAddress: signatureData.walletAddress,
    timestamp: signatureData.timestamp,
    signature: signatureData.signature.slice(0, 20) + '...',
  });
  
  const verifyResult = await verifyConfigSignature(
    identityHash,
    signatureData.timestamp,
    signatureData.signature,
    signatureData.walletAddress
  );
  console.log('Verification Result:', verifyResult);
  console.log('✓ Full flow works\n');

  // Test 5: Attestation Message
  console.log('Test 5: Generate Attestation Message');
  const attestationMessage = generateAttestationMessage({
    identityHash: '0xabcdef...',
    platform: 'chatgpt',
    agentIdentifier: 'g-abc123',
    declaredName: 'MyCustomGPT',
    timestamp: '2024-01-15T10:30:00.000Z',
  });
  console.log('Message:\n', attestationMessage);
  console.log('✓ Attestation message generated\n');

  console.log('=== All Tests Passed ===');
}

runTests().catch(console.error);
