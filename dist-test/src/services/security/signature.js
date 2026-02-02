"use strict";
/**
 * EIP-191 Signature Service
 * Handles signing and verification of AgentID identity messages
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateConfigMessage = generateConfigMessage;
exports.generateAttestationMessage = generateAttestationMessage;
exports.verifySignature = verifySignature;
exports.signMessage = signMessage;
exports.createConfigSignature = createConfigSignature;
exports.createAttestationSignature = createAttestationSignature;
exports.verifyConfigSignature = verifyConfigSignature;
exports.verifyAttestationSignature = verifyAttestationSignature;
exports.hashMessage = hashMessage;
const crypto_1 = require("crypto");
// Message templates
const CONFIG_IDENTITY_MESSAGE = `AgentID ConfigIdentity Registration

I declare ownership of this agent configuration.

Identity Hash: {identityHash}
Chain: Base Mainnet (8453)
Contract: 0x471C4c43672be2d49A2ceC79203c23b7194A22Fa
Timestamp: {timestamp}`;
const ATTESTATION_IDENTITY_MESSAGE = `AgentID Attestation Registration

I attest that I operate the following agent:

Platform: {platform}
Agent ID: {agentIdentifier}
Name: {declaredName}

Identity Hash: {identityHash}
Chain: Base Mainnet (8453)
Timestamp: {timestamp}

This is a declaration, not a verified configuration.`;
/**
 * Generate the message to be signed for ConfigIdentity
 */
function generateConfigMessage(params) {
    const timestamp = params.timestamp || new Date().toISOString();
    return CONFIG_IDENTITY_MESSAGE
        .replace('{identityHash}', params.identityHash)
        .replace('{timestamp}', timestamp);
}
/**
 * Generate the message to be signed for AttestationIdentity
 */
function generateAttestationMessage(params) {
    const timestamp = params.timestamp || new Date().toISOString();
    return ATTESTATION_IDENTITY_MESSAGE
        .replace('{identityHash}', params.identityHash)
        .replace('{platform}', params.platform)
        .replace('{agentIdentifier}', params.agentIdentifier)
        .replace('{declaredName}', params.declaredName)
        .replace('{timestamp}', timestamp);
}
/**
 * Verify an EIP-191 signature and recover the signer address
 * Uses ethers.js for signature verification
 */
async function verifySignature(message, signature) {
    try {
        // Dynamic import to avoid loading ethers if not needed
        const { verifyMessage } = await import('ethers');
        const recoveredAddress = verifyMessage(message, signature);
        return {
            valid: true,
            recoveredAddress: recoveredAddress.toLowerCase(),
        };
    }
    catch (error) {
        return {
            valid: false,
            recoveredAddress: null,
            error: error.message,
        };
    }
}
/**
 * Sign a message using a private key (for CLI usage)
 */
async function signMessage(message, privateKey) {
    const { Wallet } = await import('ethers');
    const wallet = new Wallet(privateKey);
    const signature = await wallet.signMessage(message);
    return {
        signature,
        walletAddress: wallet.address.toLowerCase(),
    };
}
/**
 * Create a complete signature data object for ConfigIdentity
 */
async function createConfigSignature(identityHash, privateKey) {
    const timestamp = new Date().toISOString();
    const message = generateConfigMessage({ identityHash, timestamp });
    const { signature, walletAddress } = await signMessage(message, privateKey);
    return {
        message,
        signature,
        walletAddress,
        timestamp,
    };
}
/**
 * Create a complete signature data object for AttestationIdentity
 */
async function createAttestationSignature(params, privateKey) {
    const timestamp = new Date().toISOString();
    const message = generateAttestationMessage({ ...params, timestamp });
    const { signature, walletAddress } = await signMessage(message, privateKey);
    return {
        message,
        signature,
        walletAddress,
        timestamp,
    };
}
/**
 * Verify a ConfigIdentity signature
 */
async function verifyConfigSignature(identityHash, timestamp, signature, expectedAddress) {
    const message = generateConfigMessage({ identityHash, timestamp });
    const result = await verifySignature(message, signature);
    if (!result.valid) {
        return { valid: false, error: result.error };
    }
    if (result.recoveredAddress !== expectedAddress.toLowerCase()) {
        return {
            valid: false,
            error: `Address mismatch: expected ${expectedAddress}, got ${result.recoveredAddress}`,
        };
    }
    return { valid: true };
}
/**
 * Verify an AttestationIdentity signature
 */
async function verifyAttestationSignature(params, signature, expectedAddress) {
    const message = generateAttestationMessage(params);
    const result = await verifySignature(message, signature);
    if (!result.valid) {
        return { valid: false, error: result.error };
    }
    if (result.recoveredAddress !== expectedAddress.toLowerCase()) {
        return {
            valid: false,
            error: `Address mismatch: expected ${expectedAddress}, got ${result.recoveredAddress}`,
        };
    }
    return { valid: true };
}
/**
 * Hash a message using keccak256 (for Ethereum compatibility)
 */
function hashMessage(message) {
    return (0, crypto_1.createHash)('sha256').update(message).digest('hex');
}
exports.default = {
    generateConfigMessage,
    generateAttestationMessage,
    verifySignature,
    signMessage,
    createConfigSignature,
    createAttestationSignature,
    verifyConfigSignature,
    verifyAttestationSignature,
    hashMessage,
};
