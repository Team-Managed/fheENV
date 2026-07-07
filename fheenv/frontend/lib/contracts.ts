import { parseAbi } from "viem";

// InEuint128 tuple: (uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature)
// Matches compiled artifact: fheENVRegistry.json -> updateEnvironment inputs
//
// parseAbi converts human-readable strings to JSON ABI objects.
// This is required because wagmi's useReadContract with the chainId parameter
// uses a code path that calls `'name' in abiItem` — which throws on raw strings.
export const REGISTRY_ABI = parseAbi([
  "function createProject(string name) returns (uint256)",
  "function addOwner(uint256 projectId, address newOwner)",
  "function transferOwnership(uint256 projectId, address newOwner)",
  "function updateEnvironment(uint256 projectId, string envName, (uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature) inKeyHigh, (uint256 ctHash, uint8 securityZone, uint8 utype, bytes signature) inKeyLow, string blobCid, uint256 expectedVersion)",
  "function grantAccess(uint256 projectId, string envName, address member)",
  "function batchGrantAccess(uint256 projectId, string envName, address[] members)",
  "function revokeAccess(uint256 projectId, string envName, address member)",
  "function getEnvironment(uint256 projectId, string envName) view returns (uint256 aesKeyHigh, uint256 aesKeyLow, string blobCid, uint256 version, uint256 updatedAt)",
  "function hasAccess(uint256 projectId, string envName, address member) view returns (bool)",
  "function projects(uint256) view returns (string name, address primaryOwner, uint256 createdAt, bool exists)",
  "function owners(uint256, address) view returns (bool)",
  "function nextProjectId() view returns (uint256)",
  "event ProjectCreated(uint256 indexed projectId, address indexed owner, string name)",
  "event EnvironmentUpdated(uint256 indexed projectId, bytes32 indexed envHash, string blobCid, uint256 version)",
  "event AccessGranted(uint256 indexed projectId, bytes32 indexed envHash, address indexed member)",
  "event AccessRevoked(uint256 indexed projectId, bytes32 indexed envHash, address indexed member)",
  "event OwnerAdded(uint256 indexed projectId, address indexed newOwner)",
]);

export const REGISTRY_ADDRESS = (process.env.NEXT_PUBLIC_REGISTRY_ADDRESS || "") as `0x${string}`;
