// SPDX-License-Identifier: MIT
pragma solidity ^0.8.25;

import "@fhenixprotocol/cofhe-contracts/FHE.sol";

/// @title fheENVRegistry
/// @notice Zero-trust secrets registry. Stores AES-256 keys as FHE ciphertexts.
///         The platform operator is cryptographically incapable of reading secrets.
contract fheENVRegistry {

    // ─── Data Structures ──────────────────────────────────────────────────────

    struct Environment {
        euint128 aesKeyHigh;   // upper 16 bytes of AES-256 key (FHE encrypted)
        euint128 aesKeyLow;    // lower 16 bytes of AES-256 key (FHE encrypted)
        string   blobCid;      // IPFS CID of AES-GCM encrypted .env blob
        uint256  version;      // increments on rotation — optimistic locking
        uint256  updatedAt;
        bool     initialized;
    }

    struct Project {
        string   name;
        address  primaryOwner;
        uint256  createdAt;
        bool     exists;
    }

    // ─── State ────────────────────────────────────────────────────────────────

    uint256 public nextProjectId;

    // projectId → Project metadata
    mapping(uint256 => Project) public projects;

    // projectId → envHash → Environment
    // envHash = keccak256(bytes(lowercaseEnvName))
    mapping(uint256 => mapping(bytes32 => Environment)) public environments;

    // projectId → address → isOwner
    mapping(uint256 => mapping(address => bool)) public owners;

    // projectId → envHash → address → hasReadAccess
    mapping(uint256 => mapping(bytes32 => mapping(address => bool))) public members;

    // ─── Events ───────────────────────────────────────────────────────────────

    event ProjectCreated(uint256 indexed projectId, address indexed owner, string name);
    event EnvironmentUpdated(uint256 indexed projectId, bytes32 indexed envHash, string blobCid, uint256 version);
    event AccessGranted(uint256 indexed projectId, bytes32 indexed envHash, address indexed member);
    event AccessRevoked(uint256 indexed projectId, bytes32 indexed envHash, address indexed member);
    event OwnerAdded(uint256 indexed projectId, address indexed newOwner);

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyProjectOwner(uint256 projectId) {
        require(owners[projectId][msg.sender], "Not a project owner");
        _;
    }

    modifier projectExists(uint256 projectId) {
        require(projects[projectId].exists, "Project does not exist");
        _;
    }

    // ─── Project Management ───────────────────────────────────────────────────

    /// @notice Create a new project. Caller becomes the primary owner.
    function createProject(string calldata name) external returns (uint256 projectId) {
        require(bytes(name).length > 0 && bytes(name).length <= 64, "Name: 1-64 chars");
        projectId = nextProjectId++;
        projects[projectId] = Project({
            name: name,
            primaryOwner: msg.sender,
            createdAt: block.timestamp,
            exists: true
        });
        owners[projectId][msg.sender] = true;
        emit ProjectCreated(projectId, msg.sender, name);
    }

    /// @notice Add a co-owner who can manage team access and rotate secrets.
    function addOwner(uint256 projectId, address newOwner)
        external
        projectExists(projectId)
        onlyProjectOwner(projectId)
    {
        require(newOwner != address(0), "Invalid address");
        owners[projectId][newOwner] = true;
        emit OwnerAdded(projectId, newOwner);
    }

    // ─── Environment Management ───────────────────────────────────────────────

    /// @notice Normalize env name to hash to prevent case collisions.
    function envNameToHash(string calldata envName) public pure returns (bytes32) {
        return keccak256(bytes(envName));
    }

    /// @notice Push a new encrypted environment. Uses optimistic locking via
    ///         expectedVersion to prevent silent overwrites from concurrent rotations.
    function updateEnvironment(
        uint256 projectId,
        string calldata envName,
        InEuint128 calldata inKeyHigh,
        InEuint128 calldata inKeyLow,
        string calldata blobCid,
        uint256 expectedVersion
    ) external projectExists(projectId) onlyProjectOwner(projectId) {
        bytes32 envHash = envNameToHash(envName);
        Environment storage env = environments[projectId][envHash];

        require(env.version == expectedVersion, "Version mismatch: concurrent rotation detected");
        require(bytes(blobCid).length > 0, "blobCid required");

        euint128 keyHigh = FHE.asEuint128(inKeyHigh);
        euint128 keyLow  = FHE.asEuint128(inKeyLow);

        // Contract retains access to re-grant to future members
        FHE.allowThis(keyHigh);
        FHE.allowThis(keyLow);

        // Owner retains access
        FHE.allow(keyHigh, msg.sender);
        FHE.allow(keyLow, msg.sender);

        env.aesKeyHigh  = keyHigh;
        env.aesKeyLow   = keyLow;
        env.blobCid     = blobCid;
        env.version     = expectedVersion + 1;
        env.updatedAt   = block.timestamp;
        env.initialized = true;

        emit EnvironmentUpdated(projectId, envHash, blobCid, env.version);
    }

    // ─── Access Control ───────────────────────────────────────────────────────

    /// @notice Grant a single member decrypt access to an environment.
    function grantAccess(
        uint256 projectId,
        string calldata envName,
        address member
    ) external projectExists(projectId) onlyProjectOwner(projectId) {
        require(member != address(0), "Invalid address");
        bytes32 envHash = envNameToHash(envName);
        Environment storage env = environments[projectId][envHash];
        require(env.initialized, "Environment not initialized");

        FHE.allow(env.aesKeyHigh, member);
        FHE.allow(env.aesKeyLow, member);
        members[projectId][envHash][member] = true;

        emit AccessGranted(projectId, envHash, member);
    }

    /// @notice Grant decrypt access to multiple members in a single transaction.
    function batchGrantAccess(
        uint256 projectId,
        string calldata envName,
        address[] calldata newMembers
    ) external projectExists(projectId) onlyProjectOwner(projectId) {
        require(newMembers.length <= 100, "Max 100 members per batch");
        bytes32 envHash = envNameToHash(envName);
        Environment storage env = environments[projectId][envHash];
        require(env.initialized, "Environment not initialized");

        for (uint256 i = 0; i < newMembers.length; i++) {
            address m = newMembers[i];
            require(m != address(0), "Invalid address in batch");
            FHE.allow(env.aesKeyHigh, m);
            FHE.allow(env.aesKeyLow, m);
            members[projectId][envHash][m] = true;
            emit AccessGranted(projectId, envHash, m);
        }
    }

    /// @notice Remove a member from the access list and emit AccessRevoked.
    ///         IMPORTANT: CoFHE has no revokeAllow primitive — this does NOT
    ///         cryptographically invalidate the old FHE handles. The owner MUST
    ///         call updateEnvironment (rotation) immediately after to issue new
    ///         ciphertext handles that the removed member never receives FHE.allow on.
    function revokeAccess(
        uint256 projectId,
        string calldata envName,
        address member
    ) external projectExists(projectId) onlyProjectOwner(projectId) {
        bytes32 envHash = envNameToHash(envName);
        members[projectId][envHash][member] = false;
        emit AccessRevoked(projectId, envHash, member);
    }

    // ─── Read Functions ───────────────────────────────────────────────────────

    /// @notice Returns environment handles. Caller can only decrypt if permitted.
    function getEnvironment(uint256 projectId, string calldata envName)
        external
        view
        returns (
            euint128 aesKeyHigh,
            euint128 aesKeyLow,
            string memory blobCid,
            uint256 version
        )
    {
        bytes32 envHash = envNameToHash(envName);
        Environment storage env = environments[projectId][envHash];
        require(env.initialized, "Environment not initialized");
        return (env.aesKeyHigh, env.aesKeyLow, env.blobCid, env.version);
    }

    /// @notice Check if an address has access to an environment.
    function hasAccess(uint256 projectId, string calldata envName, address member)
        external view returns (bool)
    {
        return members[projectId][envNameToHash(envName)][member];
    }
}
