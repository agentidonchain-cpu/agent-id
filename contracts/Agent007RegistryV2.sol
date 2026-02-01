// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Agent007RegistryV2
 * @notice On-chain registry for AI agent identities with versioning and roles
 * @dev V2 adds: agentId (stable identifier), versioning, owner/operator roles
 *
 * Key Concepts:
 * - agentId: Stable bytes32 identifier that persists across versions (generated first)
 * - identityHash: Fingerprint of a specific version's configuration
 * - versionNumber: Linear, monotonic (1-65535), no silent rollback allowed
 */
contract Agent007RegistryV2 {
    // =============================================================================
    // STRUCTS
    // =============================================================================

    struct Identity {
        bytes32 identityHash;      // Fingerprint of this version
        bytes32 agentId;           // Stable identifier (persists across versions)
        bytes32 previousVersion;   // Previous identity hash (0x0 for first version)
        address creator;           // Original creator (never changes)
        address owner;             // Current owner (can transfer)
        address operator;          // Optional operator (can act but not transfer)
        uint256 anchoredAt;
        uint256 revokedAt;
        uint16 versionNumber;      // 1-65535, linear, monotonic
        bool exists;
    }

    // =============================================================================
    // STATE
    // =============================================================================

    /// @notice Contract admin
    address public admin;

    /// @notice Mapping of identity hash to Identity struct
    mapping(bytes32 => Identity) public identities;

    /// @notice Mapping of agentId to current identity hash
    mapping(bytes32 => bytes32) public currentVersion;

    /// @notice Mapping of agentId to array of all version hashes
    mapping(bytes32 => bytes32[]) public versionHistory;

    /// @notice Array of all agentIds
    bytes32[] public allAgentIds;

    /// @notice Total statistics
    uint256 public totalAnchored;
    uint256 public totalRevoked;
    uint256 public totalAgents;

    // =============================================================================
    // EVENTS
    // =============================================================================

    event IdentityAnchored(
        bytes32 indexed identityHash,
        bytes32 indexed agentId,
        address indexed creator,
        address owner,
        uint16 versionNumber,
        uint256 timestamp
    );

    event IdentityUpdated(
        bytes32 indexed agentId,
        bytes32 oldIdentityHash,
        bytes32 newIdentityHash,
        uint16 newVersionNumber,
        uint256 timestamp
    );

    event IdentityRevoked(
        bytes32 indexed identityHash,
        bytes32 indexed agentId,
        address indexed revoker,
        uint256 timestamp
    );

    event OwnershipTransferred(
        bytes32 indexed agentId,
        address indexed previousOwner,
        address indexed newOwner
    );

    event OperatorUpdated(
        bytes32 indexed agentId,
        address indexed previousOperator,
        address indexed newOperator
    );

    event AdminTransferred(
        address indexed previousAdmin,
        address indexed newAdmin
    );

    // =============================================================================
    // MODIFIERS
    // =============================================================================

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyOwnerOrOperator(bytes32 agentId) {
        bytes32 currentHash = currentVersion[agentId];
        require(currentHash != bytes32(0), "Agent not found");
        Identity storage identity = identities[currentHash];
        require(
            msg.sender == identity.owner || msg.sender == identity.operator,
            "Not authorized"
        );
        _;
    }

    modifier onlyOwner(bytes32 agentId) {
        bytes32 currentHash = currentVersion[agentId];
        require(currentHash != bytes32(0), "Agent not found");
        require(msg.sender == identities[currentHash].owner, "Not owner");
        _;
    }

    // =============================================================================
    // CONSTRUCTOR
    // =============================================================================

    constructor() {
        admin = msg.sender;
        emit AdminTransferred(address(0), msg.sender);
    }

    // =============================================================================
    // WRITE FUNCTIONS - ANCHORING
    // =============================================================================

    /**
     * @notice Anchor a new agent identity (first version)
     * @param identityHash The SHA-256 hash of the agent identity configuration
     * @param agentId Stable identifier for this agent (pre-generated UUID as bytes32)
     */
    function anchorIdentity(bytes32 identityHash, bytes32 agentId) external {
        require(identityHash != bytes32(0), "Invalid hash");
        require(agentId != bytes32(0), "Invalid agentId");
        require(!identities[identityHash].exists, "Hash already anchored");
        require(currentVersion[agentId] == bytes32(0), "AgentId already exists");

        identities[identityHash] = Identity({
            identityHash: identityHash,
            agentId: agentId,
            previousVersion: bytes32(0),
            creator: msg.sender,
            owner: msg.sender,
            operator: address(0),
            anchoredAt: block.timestamp,
            revokedAt: 0,
            versionNumber: 1,
            exists: true
        });

        currentVersion[agentId] = identityHash;
        versionHistory[agentId].push(identityHash);
        allAgentIds.push(agentId);

        totalAnchored++;
        totalAgents++;

        emit IdentityAnchored(
            identityHash,
            agentId,
            msg.sender,
            msg.sender,
            1,
            block.timestamp
        );
    }

    /**
     * @notice Anchor with explicit owner (different from creator)
     * @param identityHash The identity hash
     * @param agentId The stable agent identifier
     * @param owner The owner address
     */
    function anchorIdentityWithOwner(
        bytes32 identityHash,
        bytes32 agentId,
        address owner
    ) external {
        require(identityHash != bytes32(0), "Invalid hash");
        require(agentId != bytes32(0), "Invalid agentId");
        require(owner != address(0), "Invalid owner");
        require(!identities[identityHash].exists, "Hash already anchored");
        require(currentVersion[agentId] == bytes32(0), "AgentId already exists");

        identities[identityHash] = Identity({
            identityHash: identityHash,
            agentId: agentId,
            previousVersion: bytes32(0),
            creator: msg.sender,
            owner: owner,
            operator: address(0),
            anchoredAt: block.timestamp,
            revokedAt: 0,
            versionNumber: 1,
            exists: true
        });

        currentVersion[agentId] = identityHash;
        versionHistory[agentId].push(identityHash);
        allAgentIds.push(agentId);

        totalAnchored++;
        totalAgents++;

        emit IdentityAnchored(
            identityHash,
            agentId,
            msg.sender,
            owner,
            1,
            block.timestamp
        );
    }

    // =============================================================================
    // WRITE FUNCTIONS - VERSIONING
    // =============================================================================

    /**
     * @notice Update agent to a new version
     * @dev Creates a new identity entry linked to the previous version
     * @param agentId The stable agent identifier
     * @param newIdentityHash The new identity hash
     */
    function updateAgentVersion(
        bytes32 agentId,
        bytes32 newIdentityHash
    ) external onlyOwnerOrOperator(agentId) {
        require(newIdentityHash != bytes32(0), "Invalid hash");
        require(!identities[newIdentityHash].exists, "Hash already anchored");

        bytes32 oldHash = currentVersion[agentId];
        Identity storage oldIdentity = identities[oldHash];

        // Check version overflow (uint16 max = 65535)
        require(oldIdentity.versionNumber < 65535, "Max versions reached");

        uint16 newVersion = oldIdentity.versionNumber + 1;

        identities[newIdentityHash] = Identity({
            identityHash: newIdentityHash,
            agentId: agentId,
            previousVersion: oldHash,
            creator: oldIdentity.creator,
            owner: oldIdentity.owner,
            operator: oldIdentity.operator,
            anchoredAt: block.timestamp,
            revokedAt: 0,
            versionNumber: newVersion,
            exists: true
        });

        currentVersion[agentId] = newIdentityHash;
        versionHistory[agentId].push(newIdentityHash);
        totalAnchored++;

        emit IdentityUpdated(
            agentId,
            oldHash,
            newIdentityHash,
            newVersion,
            block.timestamp
        );
    }

    // =============================================================================
    // WRITE FUNCTIONS - ROLES
    // =============================================================================

    /**
     * @notice Transfer ownership of an agent
     * @param agentId The agent identifier
     * @param newOwner The new owner address
     */
    function transferAgentOwnership(
        bytes32 agentId,
        address newOwner
    ) external onlyOwner(agentId) {
        require(newOwner != address(0), "Invalid address");

        bytes32 currentHash = currentVersion[agentId];
        address previousOwner = identities[currentHash].owner;
        identities[currentHash].owner = newOwner;

        emit OwnershipTransferred(agentId, previousOwner, newOwner);
    }

    /**
     * @notice Set or update operator for an agent
     * @param agentId The agent identifier
     * @param newOperator The operator address (address(0) to remove)
     */
    function setOperator(
        bytes32 agentId,
        address newOperator
    ) external onlyOwner(agentId) {
        bytes32 currentHash = currentVersion[agentId];
        address previousOperator = identities[currentHash].operator;
        identities[currentHash].operator = newOperator;

        emit OperatorUpdated(agentId, previousOperator, newOperator);
    }

    // =============================================================================
    // WRITE FUNCTIONS - REVOCATION
    // =============================================================================

    /**
     * @notice Revoke an identity version
     * @param identityHash The identity hash to revoke
     */
    function revokeIdentity(bytes32 identityHash) external {
        Identity storage identity = identities[identityHash];

        require(identity.exists, "Not found");
        require(identity.revokedAt == 0, "Already revoked");
        require(
            msg.sender == identity.owner ||
            msg.sender == identity.creator ||
            msg.sender == admin,
            "Not authorized"
        );

        identity.revokedAt = block.timestamp;
        totalRevoked++;

        emit IdentityRevoked(
            identityHash,
            identity.agentId,
            msg.sender,
            block.timestamp
        );
    }

    // =============================================================================
    // WRITE FUNCTIONS - ADMIN
    // =============================================================================

    /**
     * @notice Transfer admin role
     * @param newAdmin The new admin address
     */
    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Invalid address");
        emit AdminTransferred(admin, newAdmin);
        admin = newAdmin;
    }

    // =============================================================================
    // READ FUNCTIONS
    // =============================================================================

    /**
     * @notice Verify if an identity hash is valid (anchored and not revoked)
     * @param identityHash The identity hash to verify
     * @return valid True if valid
     */
    function verifyIdentity(bytes32 identityHash) external view returns (bool valid) {
        Identity memory identity = identities[identityHash];
        return identity.exists && identity.revokedAt == 0;
    }

    /**
     * @notice Get full identity details
     * @param identityHash The identity hash to query
     */
    function getIdentity(bytes32 identityHash) external view returns (
        bool exists,
        bytes32 agentId,
        bytes32 previousVersion,
        address creator,
        address owner,
        address operator,
        uint256 anchoredAt,
        uint256 revokedAt,
        uint16 versionNumber,
        bool isValid
    ) {
        Identity memory identity = identities[identityHash];
        return (
            identity.exists,
            identity.agentId,
            identity.previousVersion,
            identity.creator,
            identity.owner,
            identity.operator,
            identity.anchoredAt,
            identity.revokedAt,
            identity.versionNumber,
            identity.exists && identity.revokedAt == 0
        );
    }

    /**
     * @notice Get current identity hash for an agent
     * @param agentId The agent identifier
     * @return The current identity hash (0x0 if not found)
     */
    function getCurrentVersion(bytes32 agentId) external view returns (bytes32) {
        return currentVersion[agentId];
    }

    /**
     * @notice Get version history for an agent
     * @param agentId The agent identifier
     * @param limit Max number of versions to return (0 = all)
     * @return Array of identity hashes (newest first)
     */
    function getVersionHistory(
        bytes32 agentId,
        uint256 limit
    ) external view returns (bytes32[] memory) {
        bytes32[] storage history = versionHistory[agentId];
        uint256 len = history.length;

        if (limit == 0 || limit >= len) {
            // Return all, reversed (newest first)
            bytes32[] memory result = new bytes32[](len);
            for (uint256 i = 0; i < len; i++) {
                result[i] = history[len - 1 - i];
            }
            return result;
        }

        // Return limited, newest first
        bytes32[] memory result = new bytes32[](limit);
        for (uint256 i = 0; i < limit; i++) {
            result[i] = history[len - 1 - i];
        }
        return result;
    }

    /**
     * @notice Get version count for an agent
     * @param agentId The agent identifier
     * @return Number of versions
     */
    function getVersionCount(bytes32 agentId) external view returns (uint256) {
        return versionHistory[agentId].length;
    }

    /**
     * @notice Get statistics
     */
    function getStats() external view returns (
        uint256 anchored,
        uint256 revoked,
        uint256 agents,
        uint256 active
    ) {
        return (totalAnchored, totalRevoked, totalAgents, totalAnchored - totalRevoked);
    }

    /**
     * @notice Get agent ID by index
     * @param index The index in allAgentIds array
     */
    function getAgentIdByIndex(uint256 index) external view returns (bytes32) {
        require(index < allAgentIds.length, "Index out of bounds");
        return allAgentIds[index];
    }

    /**
     * @notice Get total number of agents
     */
    function getAgentCount() external view returns (uint256) {
        return allAgentIds.length;
    }
}
