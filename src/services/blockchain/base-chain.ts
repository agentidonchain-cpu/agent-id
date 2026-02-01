/**
 * Agent007 - Base Blockchain Service
 *
 * Anchors agent identity hashes on Base Mainnet for immutable verification.
 */

import { ethers, Contract, Wallet, JsonRpcProvider, formatEther, parseEther } from 'ethers';
import { logger } from '../../utils/logger.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ChainConfig {
  chainId: number;
  name: string;
  rpcUrl: string;
  explorerUrl: string;
  contractAddress?: string;
}

export interface AnchorResult {
  success: boolean;
  transactionHash?: string;
  blockNumber?: number;
  gasUsed?: string;
  timestamp?: number;
  explorerUrl?: string;
  error?: string;
}

export interface VerifyResult {
  exists: boolean;
  valid: boolean;
  creator?: string;
  anchoredAt?: number;
  revokedAt?: number;
  blockchainProof?: {
    transactionHash: string;
    blockNumber: number;
  };
}

export interface VerifyResultV2 extends VerifyResult {
  agentId?: string;
  previousVersion?: string;
  owner?: string;
  operator?: string;
  versionNumber?: number;
}

export interface BlockchainStats {
  connected: boolean;
  chainId: number;
  chainName: string;
  walletAddress?: string;
  balance?: string;
  contractAddress?: string;
  contractDeployed: boolean;
  totalAnchored?: number;
  totalRevoked?: number;
}

// =============================================================================
// CHAIN CONFIGURATIONS
// =============================================================================

export const CHAIN_CONFIGS: Record<string, ChainConfig> = {
  base: {
    chainId: 8453,
    name: 'Base Mainnet',
    rpcUrl: 'https://mainnet.base.org',
    explorerUrl: 'https://basescan.org',
  },
  baseSepolia: {
    chainId: 84532,
    name: 'Base Sepolia',
    rpcUrl: 'https://sepolia.base.org',
    explorerUrl: 'https://sepolia.basescan.org',
  },
  ethereum: {
    chainId: 1,
    name: 'Ethereum Mainnet',
    rpcUrl: 'https://eth.llamarpc.com',
    explorerUrl: 'https://etherscan.io',
  },
  sepolia: {
    chainId: 11155111,
    name: 'Sepolia Testnet',
    rpcUrl: 'https://rpc.sepolia.org',
    explorerUrl: 'https://sepolia.etherscan.io',
  },
};

// =============================================================================
// CONTRACT ABI (Minimal for interaction)
// =============================================================================

const REGISTRY_ABI = [
  // Write functions
  'function anchorIdentity(bytes32 identityHash) external',
  'function batchAnchor(bytes32[] calldata hashes) external',
  'function revokeIdentity(bytes32 identityHash) external',

  // Read functions
  'function verifyIdentity(bytes32 identityHash) external view returns (bool valid)',
  'function getIdentity(bytes32 identityHash) external view returns (bool exists, address creator, uint256 anchoredAt, uint256 revokedAt, bool isValid)',
  'function getStats() external view returns (uint256 anchored, uint256 revoked, uint256 active)',
  'function owner() external view returns (address)',
  'function totalAnchored() external view returns (uint256)',
  'function totalRevoked() external view returns (uint256)',

  // Events
  'event IdentityAnchored(bytes32 indexed identityHash, address indexed creator, uint256 timestamp)',
  'event IdentityRevoked(bytes32 indexed identityHash, address indexed revoker, uint256 timestamp)',
];

// V2 ABI with agentId, versioning, and roles
const REGISTRY_V2_ABI = [
  // Write functions
  'function anchorIdentity(bytes32 identityHash, bytes32 agentId) external',
  'function anchorIdentityWithOwner(bytes32 identityHash, bytes32 agentId, address owner) external',
  'function updateAgentVersion(bytes32 agentId, bytes32 newIdentityHash) external',
  'function revokeIdentity(bytes32 identityHash) external',
  'function transferAgentOwnership(bytes32 agentId, address newOwner) external',
  'function setOperator(bytes32 agentId, address newOperator) external',

  // Read functions
  'function verifyIdentity(bytes32 identityHash) external view returns (bool valid)',
  'function getIdentity(bytes32 identityHash) external view returns (bool exists, bytes32 agentId, bytes32 previousVersion, address creator, address owner, address operator, uint256 anchoredAt, uint256 revokedAt, uint16 versionNumber, bool isValid)',
  'function getCurrentVersion(bytes32 agentId) external view returns (bytes32)',
  'function getVersionHistory(bytes32 agentId, uint256 limit) external view returns (bytes32[] memory)',
  'function getVersionCount(bytes32 agentId) external view returns (uint256)',
  'function getStats() external view returns (uint256 anchored, uint256 revoked, uint256 agents, uint256 active)',
  'function admin() external view returns (address)',
  'function totalAnchored() external view returns (uint256)',
  'function totalRevoked() external view returns (uint256)',
  'function totalAgents() external view returns (uint256)',

  // Events
  'event IdentityAnchored(bytes32 indexed identityHash, bytes32 indexed agentId, address indexed creator, address owner, uint16 versionNumber, uint256 timestamp)',
  'event IdentityUpdated(bytes32 indexed agentId, bytes32 oldIdentityHash, bytes32 newIdentityHash, uint16 newVersionNumber, uint256 timestamp)',
  'event IdentityRevoked(bytes32 indexed identityHash, bytes32 indexed agentId, address indexed revoker, uint256 timestamp)',
  'event OwnershipTransferred(bytes32 indexed agentId, address indexed previousOwner, address indexed newOwner)',
  'event OperatorUpdated(bytes32 indexed agentId, address indexed previousOperator, address indexed newOperator)',
];

// =============================================================================
// BLOCKCHAIN SERVICE
// =============================================================================

export class BaseBlockchainService {
  private provider: JsonRpcProvider | null = null;
  private wallet: Wallet | null = null;
  private contract: Contract | null = null;
  private contractV2: Contract | null = null;
  private config: ChainConfig;
  private contractAddress: string | null = null;
  private contractV2Address: string | null = null;

  constructor(chain: string = 'base') {
    this.config = CHAIN_CONFIGS[chain] || CHAIN_CONFIGS.base;
  }

  // ===========================================================================
  // INITIALIZATION
  // ===========================================================================

  /**
   * Initialize connection to blockchain
   */
  async initialize(): Promise<boolean> {
    try {
      const rpcUrl = process.env.BLOCKCHAIN_RPC_URL || this.config.rpcUrl;
      const privateKey = process.env.BLOCKCHAIN_PRIVATE_KEY;
      this.contractAddress = process.env.BLOCKCHAIN_CONTRACT_ADDRESS || null;

      // Create provider
      this.provider = new JsonRpcProvider(rpcUrl);

      // Verify connection
      const network = await this.provider.getNetwork();
      logger.info({
        chainId: Number(network.chainId),
        chainName: this.config.name,
        rpcUrl: rpcUrl.replace(/\/\/.*@/, '//***@'), // Hide credentials if any
      }, 'Connected to blockchain');

      // Create wallet if private key provided
      if (privateKey) {
        this.wallet = new Wallet(privateKey, this.provider);
        const balance = await this.provider.getBalance(this.wallet.address);

        logger.info({
          address: this.wallet.address,
          balance: formatEther(balance),
        }, 'Wallet initialized');
      } else {
        logger.warn('No private key configured - read-only mode');
      }

      // Connect to contract if address provided
      if (this.contractAddress) {
        this.contract = new Contract(
          this.contractAddress,
          REGISTRY_ABI,
          this.wallet || this.provider
        );
        logger.info({ contractAddress: this.contractAddress }, 'Contract V1 connected');
      } else {
        logger.warn('No contract address configured - deployment required');
      }

      // Connect to V2 contract if address provided
      this.contractV2Address = process.env.BLOCKCHAIN_CONTRACT_V2_ADDRESS || null;
      if (this.contractV2Address) {
        this.contractV2 = new Contract(
          this.contractV2Address,
          REGISTRY_V2_ABI,
          this.wallet || this.provider
        );
        logger.info({ contractAddress: this.contractV2Address }, 'Contract V2 connected');
      }

      return true;
    } catch (error) {
      logger.error({ error }, 'Failed to initialize blockchain connection');
      return false;
    }
  }

  /**
   * Check if service is ready for write operations
   */
  isWriteReady(): boolean {
    return this.wallet !== null && this.contract !== null;
  }

  /**
   * Check if service is ready for read operations
   */
  isReadReady(): boolean {
    return this.provider !== null && this.contract !== null;
  }

  // ===========================================================================
  // ANCHOR OPERATIONS
  // ===========================================================================

  /**
   * Anchor an identity hash on-chain
   */
  async anchorIdentity(identityHash: string): Promise<AnchorResult> {
    if (!this.isWriteReady()) {
      return {
        success: false,
        error: 'Blockchain service not configured for write operations',
      };
    }

    try {
      // Convert to bytes32
      const hashBytes = this.toBytes32(identityHash);

      // Check if already anchored
      const exists = await this.contract!.verifyIdentity(hashBytes);
      if (exists) {
        return {
          success: false,
          error: 'Identity already anchored on-chain',
        };
      }

      // Estimate gas
      const gasEstimate = await this.contract!.anchorIdentity.estimateGas(hashBytes);

      // Send transaction
      const tx = await this.contract!.anchorIdentity(hashBytes, {
        gasLimit: gasEstimate * 120n / 100n, // 20% buffer
      });

      logger.info({ txHash: tx.hash, identityHash }, 'Anchor transaction sent');

      // Wait for confirmation
      const receipt = await tx.wait(1);

      const result: AnchorResult = {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        timestamp: Date.now(),
        explorerUrl: `${this.config.explorerUrl}/tx/${receipt.hash}`,
      };

      logger.info(result, 'Identity anchored on-chain');

      return result;
    } catch (error: any) {
      logger.error({ error, identityHash }, 'Failed to anchor identity');
      return {
        success: false,
        error: error.message || 'Anchor transaction failed',
      };
    }
  }

  /**
   * Anchor multiple identities in one transaction
   */
  async batchAnchor(identityHashes: string[]): Promise<{
    success: boolean;
    transactionHash?: string;
    anchored: number;
    skipped: number;
    error?: string;
  }> {
    if (!this.isWriteReady()) {
      return {
        success: false,
        anchored: 0,
        skipped: identityHashes.length,
        error: 'Blockchain service not configured for write operations',
      };
    }

    try {
      // Convert all to bytes32
      const hashesBytes = identityHashes.map(h => this.toBytes32(h));

      // Filter out already anchored
      const toAnchor: string[] = [];
      for (let i = 0; i < hashesBytes.length; i++) {
        const exists = await this.contract!.verifyIdentity(hashesBytes[i]);
        if (!exists) {
          toAnchor.push(hashesBytes[i]);
        }
      }

      if (toAnchor.length === 0) {
        return {
          success: true,
          anchored: 0,
          skipped: identityHashes.length,
        };
      }

      // Send batch transaction
      const tx = await this.contract!.batchAnchor(toAnchor);
      const receipt = await tx.wait(1);

      return {
        success: true,
        transactionHash: receipt.hash,
        anchored: toAnchor.length,
        skipped: identityHashes.length - toAnchor.length,
      };
    } catch (error: any) {
      return {
        success: false,
        anchored: 0,
        skipped: identityHashes.length,
        error: error.message,
      };
    }
  }

  // ===========================================================================
  // V2 ANCHOR OPERATIONS (with agentId and versioning)
  // ===========================================================================

  /**
   * Check if V2 contract is ready
   */
  isV2Ready(): boolean {
    return this.contractV2 !== null && this.wallet !== null;
  }

  /**
   * Check if V2 contract is available for reads
   */
  isV2ReadReady(): boolean {
    return this.contractV2 !== null && this.provider !== null;
  }

  /**
   * Anchor an identity with agentId (V2)
   */
  async anchorIdentityWithAgentId(
    identityHash: string,
    agentId: string
  ): Promise<AnchorResult> {
    if (!this.isV2Ready()) {
      return {
        success: false,
        error: 'V2 blockchain service not configured for write operations',
      };
    }

    try {
      const hashBytes = this.toBytes32(identityHash);
      const agentIdBytes = this.toBytes32(agentId);

      // Check if already anchored
      const exists = await this.contractV2!.verifyIdentity(hashBytes);
      if (exists) {
        return {
          success: false,
          error: 'Identity already anchored on-chain',
        };
      }

      // Check if agentId already exists
      const currentVersion = await this.contractV2!.getCurrentVersion(agentIdBytes);
      if (currentVersion !== ethers.ZeroHash) {
        return {
          success: false,
          error: 'AgentId already exists - use updateAgentVersion instead',
        };
      }

      // Estimate gas
      const gasEstimate = await this.contractV2!.anchorIdentity.estimateGas(
        hashBytes,
        agentIdBytes
      );

      // Send transaction
      const tx = await this.contractV2!.anchorIdentity(hashBytes, agentIdBytes, {
        gasLimit: gasEstimate * 120n / 100n,
      });

      logger.info({ txHash: tx.hash, identityHash, agentId }, 'V2 anchor transaction sent');

      const receipt = await tx.wait(1);

      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        timestamp: Date.now(),
        explorerUrl: `${this.config.explorerUrl}/tx/${receipt.hash}`,
      };
    } catch (error: any) {
      logger.error({ error, identityHash, agentId }, 'Failed to anchor identity V2');
      return {
        success: false,
        error: error.message || 'V2 anchor transaction failed',
      };
    }
  }

  /**
   * Update agent to a new version (V2)
   */
  async updateAgentVersion(
    agentId: string,
    newIdentityHash: string
  ): Promise<AnchorResult> {
    if (!this.isV2Ready()) {
      return {
        success: false,
        error: 'V2 blockchain service not configured for write operations',
      };
    }

    try {
      const agentIdBytes = this.toBytes32(agentId);
      const newHashBytes = this.toBytes32(newIdentityHash);

      // Check if agentId exists
      const currentVersion = await this.contractV2!.getCurrentVersion(agentIdBytes);
      if (currentVersion === ethers.ZeroHash) {
        return {
          success: false,
          error: 'AgentId not found - use anchorIdentityWithAgentId first',
        };
      }

      // Check if new hash already exists
      const exists = await this.contractV2!.verifyIdentity(newHashBytes);
      if (exists) {
        return {
          success: false,
          error: 'New identity hash already anchored',
        };
      }

      // Estimate gas
      const gasEstimate = await this.contractV2!.updateAgentVersion.estimateGas(
        agentIdBytes,
        newHashBytes
      );

      // Send transaction
      const tx = await this.contractV2!.updateAgentVersion(agentIdBytes, newHashBytes, {
        gasLimit: gasEstimate * 120n / 100n,
      });

      logger.info({ txHash: tx.hash, agentId, newIdentityHash }, 'Version update transaction sent');

      const receipt = await tx.wait(1);

      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        timestamp: Date.now(),
        explorerUrl: `${this.config.explorerUrl}/tx/${receipt.hash}`,
      };
    } catch (error: any) {
      logger.error({ error, agentId, newIdentityHash }, 'Failed to update agent version');
      return {
        success: false,
        error: error.message || 'Version update transaction failed',
      };
    }
  }

  /**
   * Get current version for an agent (V2)
   */
  async getCurrentVersionV2(agentId: string): Promise<string | null> {
    if (!this.isV2ReadReady()) return null;

    try {
      const agentIdBytes = this.toBytes32(agentId);
      const currentHash = await this.contractV2!.getCurrentVersion(agentIdBytes);

      if (currentHash === ethers.ZeroHash) {
        return null;
      }

      return currentHash;
    } catch (error) {
      logger.error({ error, agentId }, 'Failed to get current version');
      return null;
    }
  }

  /**
   * Get version history for an agent (V2)
   */
  async getVersionHistory(agentId: string, limit: number = 0): Promise<string[]> {
    if (!this.isV2ReadReady()) return [];

    try {
      const agentIdBytes = this.toBytes32(agentId);
      const history = await this.contractV2!.getVersionHistory(agentIdBytes, limit);

      return history.filter((h: string) => h !== ethers.ZeroHash);
    } catch (error) {
      logger.error({ error, agentId }, 'Failed to get version history');
      return [];
    }
  }

  /**
   * Verify identity with full V2 details
   */
  async verifyIdentityV2(identityHash: string): Promise<VerifyResultV2> {
    if (!this.isV2ReadReady()) {
      return { exists: false, valid: false };
    }

    try {
      const hashBytes = this.toBytes32(identityHash);

      const [
        exists,
        agentId,
        previousVersion,
        creator,
        owner,
        operator,
        anchoredAt,
        revokedAt,
        versionNumber,
        isValid,
      ] = await this.contractV2!.getIdentity(hashBytes);

      return {
        exists,
        valid: isValid,
        agentId: agentId !== ethers.ZeroHash ? agentId : undefined,
        previousVersion: previousVersion !== ethers.ZeroHash ? previousVersion : undefined,
        creator: exists ? creator : undefined,
        owner: exists ? owner : undefined,
        operator: operator !== ethers.ZeroAddress ? operator : undefined,
        anchoredAt: exists ? Number(anchoredAt) : undefined,
        revokedAt: exists && revokedAt > 0 ? Number(revokedAt) : undefined,
        versionNumber: exists ? Number(versionNumber) : undefined,
      };
    } catch (error) {
      logger.error({ error, identityHash }, 'Failed to verify identity V2');
      return { exists: false, valid: false };
    }
  }

  /**
   * Transfer agent ownership (V2)
   */
  async transferAgentOwnership(
    agentId: string,
    newOwner: string
  ): Promise<AnchorResult> {
    if (!this.isV2Ready()) {
      return {
        success: false,
        error: 'V2 blockchain service not configured for write operations',
      };
    }

    try {
      const agentIdBytes = this.toBytes32(agentId);

      const tx = await this.contractV2!.transferAgentOwnership(agentIdBytes, newOwner);
      const receipt = await tx.wait(1);

      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        timestamp: Date.now(),
        explorerUrl: `${this.config.explorerUrl}/tx/${receipt.hash}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Set operator for an agent (V2)
   */
  async setAgentOperator(
    agentId: string,
    operator: string
  ): Promise<AnchorResult> {
    if (!this.isV2Ready()) {
      return {
        success: false,
        error: 'V2 blockchain service not configured for write operations',
      };
    }

    try {
      const agentIdBytes = this.toBytes32(agentId);

      const tx = await this.contractV2!.setOperator(agentIdBytes, operator);
      const receipt = await tx.wait(1);

      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        timestamp: Date.now(),
        explorerUrl: `${this.config.explorerUrl}/tx/${receipt.hash}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Revoke an identity on-chain
   */
  async revokeIdentity(identityHash: string): Promise<AnchorResult> {
    if (!this.isWriteReady()) {
      return {
        success: false,
        error: 'Blockchain service not configured for write operations',
      };
    }

    try {
      const hashBytes = this.toBytes32(identityHash);

      const tx = await this.contract!.revokeIdentity(hashBytes);
      const receipt = await tx.wait(1);

      return {
        success: true,
        transactionHash: receipt.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        timestamp: Date.now(),
        explorerUrl: `${this.config.explorerUrl}/tx/${receipt.hash}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // ===========================================================================
  // VERIFICATION OPERATIONS
  // ===========================================================================

  /**
   * Verify an identity on-chain
   */
  async verifyIdentity(identityHash: string): Promise<VerifyResult> {
    if (!this.isReadReady()) {
      return { exists: false, valid: false };
    }

    try {
      const hashBytes = this.toBytes32(identityHash);

      const [exists, creator, anchoredAt, revokedAt, isValid] =
        await this.contract!.getIdentity(hashBytes);

      return {
        exists,
        valid: isValid,
        creator: exists ? creator : undefined,
        anchoredAt: exists ? Number(anchoredAt) : undefined,
        revokedAt: exists && revokedAt > 0 ? Number(revokedAt) : undefined,
      };
    } catch (error) {
      logger.error({ error, identityHash }, 'Failed to verify identity on-chain');
      return { exists: false, valid: false };
    }
  }

  /**
   * Quick verify - just check if valid
   */
  async isValid(identityHash: string): Promise<boolean> {
    if (!this.isReadReady()) return false;

    try {
      const hashBytes = this.toBytes32(identityHash);
      return await this.contract!.verifyIdentity(hashBytes);
    } catch {
      return false;
    }
  }

  // ===========================================================================
  // STATUS & STATS
  // ===========================================================================

  /**
   * Get blockchain connection status
   */
  async getStatus(): Promise<BlockchainStats> {
    const stats: BlockchainStats = {
      connected: false,
      chainId: this.config.chainId,
      chainName: this.config.name,
      contractDeployed: false,
    };

    try {
      if (!this.provider) {
        return stats;
      }

      // Check connection
      const network = await this.provider.getNetwork();
      stats.connected = true;
      stats.chainId = Number(network.chainId);

      // Get wallet info
      if (this.wallet) {
        stats.walletAddress = this.wallet.address;
        const balance = await this.provider.getBalance(this.wallet.address);
        stats.balance = formatEther(balance);
      }

      // Get contract info
      if (this.contract && this.contractAddress) {
        stats.contractAddress = this.contractAddress;
        stats.contractDeployed = true;

        try {
          const [anchored, revoked] = await Promise.all([
            this.contract.totalAnchored(),
            this.contract.totalRevoked(),
          ]);
          stats.totalAnchored = Number(anchored);
          stats.totalRevoked = Number(revoked);
        } catch {
          // Contract might not be deployed yet
          stats.contractDeployed = false;
        }
      }

      return stats;
    } catch (error) {
      logger.error({ error }, 'Failed to get blockchain status');
      return stats;
    }
  }

  /**
   * Estimate gas for anchoring
   */
  async estimateAnchorGas(identityHash: string): Promise<{
    gasLimit: string;
    gasPriceGwei: string;
    estimatedCostEth: string;
    estimatedCostUsd?: string;
  } | null> {
    if (!this.isWriteReady()) return null;

    try {
      const hashBytes = this.toBytes32(identityHash);
      const gasLimit = await this.contract!.anchorIdentity.estimateGas(hashBytes);
      const feeData = await this.provider!.getFeeData();
      const gasPrice = feeData.gasPrice || 0n;

      const estimatedCost = gasLimit * gasPrice;

      return {
        gasLimit: gasLimit.toString(),
        gasPriceGwei: (Number(gasPrice) / 1e9).toFixed(4),
        estimatedCostEth: formatEther(estimatedCost),
      };
    } catch {
      return null;
    }
  }

  // ===========================================================================
  // HELPERS
  // ===========================================================================

  /**
   * Convert hex string to bytes32
   */
  private toBytes32(hexString: string): string {
    // Remove 0x prefix if present
    const clean = hexString.startsWith('0x') ? hexString.slice(2) : hexString;

    // Pad to 64 characters (32 bytes)
    const padded = clean.padStart(64, '0');

    return '0x' + padded;
  }

  /**
   * Get explorer URL for transaction
   */
  getExplorerUrl(txHash: string): string {
    return `${this.config.explorerUrl}/tx/${txHash}`;
  }

  /**
   * Get explorer URL for address
   */
  getAddressUrl(address: string): string {
    return `${this.config.explorerUrl}/address/${address}`;
  }
}

// =============================================================================
// SINGLETON
// =============================================================================

let blockchainServiceInstance: BaseBlockchainService | null = null;
let initialized = false;

export async function getBlockchainService(): Promise<BaseBlockchainService> {
  if (!blockchainServiceInstance) {
    const chain = process.env.BLOCKCHAIN_CHAIN || 'base';
    blockchainServiceInstance = new BaseBlockchainService(chain);
  }

  if (!initialized) {
    await blockchainServiceInstance.initialize();
    initialized = true;
  }

  return blockchainServiceInstance;
}

export function resetBlockchainService(): void {
  blockchainServiceInstance = null;
  initialized = false;
}
