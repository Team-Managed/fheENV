// Re-exported from @fheenv/core — do not duplicate logic here.
export type { InEuint128, EnvironmentData } from "@fheenv/core";
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
} from "@fheenv/core";
