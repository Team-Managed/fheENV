import { Address } from "viem";
import { createCommandContext } from "../lib/command-context";
import { readProjectConfig, writeProjectConfig } from "../lib/config";
import { FheEnvConfigV2, SignerConfig, validateConfigV2 } from "../lib/config-v2";

export interface ConfigureSignerOptions {
  type: SignerConfig["type"];
  credential?: string;
  derivationPath?: string;
  keyId?: string;
  provider?: string;
  expectedAddress?: string;
}

interface SignerCommandDependencies {
  readConfig?: () => FheEnvConfigV2;
  writeConfig?: (config: FheEnvConfigV2) => void;
  proveSigner?: (config: FheEnvConfigV2) => Promise<Address>;
}

function signerFromOptions(
  options: ConfigureSignerOptions,
  securityMode: FheEnvConfigV2["securityMode"],
): SignerConfig {
  switch (options.type) {
    case "walletconnect":
      if (!options.credential) throw new Error("--credential is required for WalletConnect.");
      return {
        type: "walletconnect",
        credentialRef: options.credential,
        expectedAddress: options.expectedAddress,
      };
    case "ledger":
      return {
        type: "ledger",
        derivationPath: options.derivationPath ?? "44'/60'/0'/0/0",
        expectedAddress: options.expectedAddress,
      };
    case "aws-kms":
      if (!options.keyId || !options.expectedAddress) {
        throw new Error("--key-id and --expected-address are required for AWS KMS.");
      }
      return {
        type: "aws-kms",
        keyId: options.keyId,
        expectedAddress: options.expectedAddress,
      };
    case "external":
      if (!options.provider || !options.expectedAddress) {
        throw new Error("--provider and --expected-address are required for an external signer.");
      }
      return {
        type: "external",
        provider: options.provider,
        expectedAddress: options.expectedAddress,
      };
    case "local-encrypted":
      if (securityMode !== "development") {
        throw new Error("The local encrypted signer is available only in development mode.");
      }
      return { type: "local-encrypted", expectedAddress: options.expectedAddress };
  }
}

export async function configureSigner(
  options: ConfigureSignerOptions,
  dependencies: SignerCommandDependencies = {},
): Promise<{ type: string; expectedAddress?: string; configured: true }> {
  const readConfig = dependencies.readConfig ?? readProjectConfig;
  const current = readConfig();
  let signer = signerFromOptions(options, current.securityMode);
  let candidate = validateConfigV2({ ...current, signer });
  if (signer.type === "walletconnect" || signer.type === "ledger") {
    const proveSigner =
      dependencies.proveSigner ??
      (async (config: FheEnvConfigV2) => {
        const context = await createCommandContext(config);
        try {
          return context.signer.address;
        } finally {
          await context.close();
        }
      });
    const address = await proveSigner(candidate);
    signer = { ...signer, expectedAddress: address };
    candidate = validateConfigV2({ ...current, signer });
  }
  (dependencies.writeConfig ?? writeProjectConfig)(candidate);
  return {
    type: signer.type,
    expectedAddress: signer.expectedAddress,
    configured: true,
  };
}

export function signerStatus(dependencies: Pick<SignerCommandDependencies, "readConfig"> = {}): {
  type: string;
  expectedAddress?: string;
  securityMode: string;
} {
  const config = (dependencies.readConfig ?? readProjectConfig)();
  return {
    type: config.signer.type,
    expectedAddress: config.signer.expectedAddress,
    securityMode: config.securityMode,
  };
}
