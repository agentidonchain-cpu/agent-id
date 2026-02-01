// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title Agent007Registry
 * @notice On-chain registry for AI agent identity hashes
 * @dev Stores identity hashes with timestamps for immutable verification
 */
contract Agent007Registry {
    // =============================================================================
    // STRUCTS
    // =============================================================================

    struct Identity {
        bytes32 identityHash;
        address creator;
        uint256 anchoredAt;
        uint256 revokedAt;
        bool exists;
    }

    // =============================================================================
    // STATE
    // =============================================================================

    /// @notice Owner of the contract
    address public owner;

    /// @notice Mapping of identity hash to Identity struct
    mapping(bytes32 => Identity) public identities;

    /// @notice Array of all anchored identity hashes
    bytes32[] public allIdentityHashes;

    /// @notice Total number of anchored identities
    uint256 public totalAnchored;

    /// @notice Total number of revoked identities
    uint256 public totalRevoked;

    // =============================================================================
    // EVENTS
    // =============================================================================

    event IdentityAnchored(
        bytes32 indexed identityHash,
        address indexed creator,
        uint256 timestamp
    );

    event IdentityRevoked(
        bytes32 indexed identityHash,
        address indexed revoker,
        uint256 timestamp
    );

    event OwnershipTransferred(
        address indexed previousOwner,
        address indexed newOwner
    );

    // =============================================================================
    // MODIFIERS
    // =============================================================================

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    // =============================================================================
    // CONSTRUCTOR
    // =============================================================================

    constructor() {
        owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    // =============================================================================
    // WRITE FUNCTIONS
    // =============================================================================

    /**
     * @notice Anchor an identity hash on-chain
     * @param identityHash The SHA-256 hash of the agent identity
     */
    function anchorIdentity(bytes32 identityHash) external {
        require(identityHash != bytes32(0), "Invalid hash");
        require(!identities[identityHash].exists, "Already anchored");

        identities[identityHash] = Identity({
            identityHash: identityHash,
            creator: msg.sender,
            anchoredAt: block.timestamp,
            revokedAt: 0,
            exists: true
        });

        allIdentityHashes.push(identityHash);
        totalAnchored++;

        emit IdentityAnchored(identityHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Anchor multiple identity hashes in one transaction
     * @param hashes Array of identity hashes to anchor
     */
    function batchAnchor(bytes32[] calldata hashes) external {
        for (uint256 i = 0; i < hashes.length; i++) {
            bytes32 identityHash = hashes[i];

            if (identityHash == bytes32(0) || identities[identityHash].exists) {
                continue; // Skip invalid or existing
            }

            identities[identityHash] = Identity({
                identityHash: identityHash,
                creator: msg.sender,
                anchoredAt: block.timestamp,
                revokedAt: 0,
                exists: true
            });

            allIdentityHashes.push(identityHash);
            totalAnchored++;

            emit IdentityAnchored(identityHash, msg.sender, block.timestamp);
        }
    }

    /**
     * @notice Revoke an identity (only creator or owner can revoke)
     * @param identityHash The identity hash to revoke
     */
    function revokeIdentity(bytes32 identityHash) external {
        Identity storage identity = identities[identityHash];

        require(identity.exists, "Not found");
        require(identity.revokedAt == 0, "Already revoked");
        require(
            msg.sender == identity.creator || msg.sender == owner,
            "Not authorized"
        );

        identity.revokedAt = block.timestamp;
        totalRevoked++;

        emit IdentityRevoked(identityHash, msg.sender, block.timestamp);
    }

    /**
     * @notice Transfer ownership of the contract
     * @param newOwner The new owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid address");
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // =============================================================================
    // READ FUNCTIONS
    // =============================================================================

    /**
     * @notice Verify if an identity hash is anchored and not revoked
     * @param identityHash The identity hash to verify
     * @return valid True if anchored and not revoked
     */
    function verifyIdentity(bytes32 identityHash) external view returns (bool valid) {
        Identity memory identity = identities[identityHash];
        return identity.exists && identity.revokedAt == 0;
    }

    /**
     * @notice Get full identity details
     * @param identityHash The identity hash to query
     * @return exists Whether the identity exists
     * @return creator The address that anchored it
     * @return anchoredAt Timestamp when anchored
     * @return revokedAt Timestamp when revoked (0 if not revoked)
     * @return isValid True if exists and not revoked
     */
    function getIdentity(bytes32 identityHash) external view returns (
        bool exists,
        address creator,
        uint256 anchoredAt,
        uint256 revokedAt,
        bool isValid
    ) {
        Identity memory identity = identities[identityHash];
        return (
            identity.exists,
            identity.creator,
            identity.anchoredAt,
            identity.revokedAt,
            identity.exists && identity.revokedAt == 0
        );
    }

    /**
     * @notice Get total count of identities
     * @return anchored Total anchored
     * @return revoked Total revoked
     * @return active Total active (anchored - revoked)
     */
    function getStats() external view returns (
        uint256 anchored,
        uint256 revoked,
        uint256 active
    ) {
        return (totalAnchored, totalRevoked, totalAnchored - totalRevoked);
    }

    /**
     * @notice Get identity hash by index
     * @param index The index in the array
     * @return The identity hash at that index
     */
    function getIdentityHashByIndex(uint256 index) external view returns (bytes32) {
        require(index < allIdentityHashes.length, "Index out of bounds");
        return allIdentityHashes[index];
    }

    /**
     * @notice Get total number of identity hashes
     * @return The length of allIdentityHashes array
     */
    function getIdentityCount() external view returns (uint256) {
        return allIdentityHashes.length;
    }
}
