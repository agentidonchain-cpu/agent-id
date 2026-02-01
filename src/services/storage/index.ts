/**
 * Agent007 - Storage Services Index
 *
 * Central export point for storage services.
 */

export {
  AgentStorageService,
  getAgentStorageService,
  resetAgentStorageService,
  type StoredRegistration,
  type StoredIdentity,
} from './agent-storage.js';

export {
  VerificationStorageService,
  getVerificationStorageService,
  resetVerificationStorageService,
} from './verification-storage.js';
