import { parseAbi } from "viem";

export const REGISTRY_ABI = parseAbi([
  "event ProjectCreated(uint256 indexed projectId, address indexed owner, string name)",
  "event EnvironmentUpdated(uint256 indexed projectId, bytes32 indexed envHash, string blobCid, uint256 version)",
  "event AccessGranted(uint256 indexed projectId, bytes32 indexed envHash, address indexed member)",
  "event AccessRevoked(uint256 indexed projectId, bytes32 indexed envHash, address indexed member)",
  "event OwnerAdded(uint256 indexed projectId, address indexed newOwner)",
]);
