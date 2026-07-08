// AES-256-GCM utilities (Node.js)
export {
  generateAesKeyNode,
  aesEncryptNode,
  aesDecryptNode,
  splitAesKeyToUint128Node,
  joinUint128ToAesKeyNode,
} from "./aes";

// IPFS upload / fetch / unpin (Node.js via Pinata)
export { uploadToIPFSNode, fetchFromIPFSNode, unpinFromIPFSNode } from "./ipfs";

// fheENVRegistry contract helpers (Node.js via viem)
export type { InEuint128, EnvironmentData } from "./contracts";
export {
  getEnvironment,
  createProject,
  updateEnvironment,
  grantAccess,
  grantAccessWithExpiry,
  revokeAccess,
  batchGrantAccess,
  getActiveMembers,
  addRotator,
  removeRotator,
  isRotator,
} from "./contracts";

// FHE encryption / decryption (Node.js via @cofhe/sdk/node)
export type { FheEncryptedUint128 } from "./fhe";
export {
  createFheClient,
  fheEncryptUint128,
  fheDecryptUint128,
  toInEuint128,
  Encryptable,
  FheTypes,
} from "./fhe";

// .env parser utilities
export { parseEnvNode, serializeEnvNode } from "./env-parser";

// Structured audit log (SOC 2 CC7.2)
export type { AuditEvent, AuditAction, RotationTrigger } from "./audit";
export { logAuditEvent } from "./audit";

// Core rotation pipeline — single source of truth (§4 Phase 1)
export type { RotateEnvironmentParams, RotateEnvironmentResult } from "./rotate";
export { rotateEnvironment } from "./rotate";
export type { DecryptEnvironmentParams, DecryptEnvironmentResult } from "./rotate";
export { decryptEnvironmentContent } from "./rotate";
