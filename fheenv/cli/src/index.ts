#!/usr/bin/env node
import { Command } from "commander";
import chalk from "chalk";
import { loginCommand } from "./commands/login";
import { initCommand } from "./commands/init";
import { pushCommand } from "./commands/push";
import { pullCommand } from "./commands/pull";
import { runCommand } from "./commands/run";
import { teamAddCommand } from "./commands/team-add";
import { teamRemoveCommand } from "./commands/team-remove";
import { teamRemoveOwnerCommand } from "./commands/team-remove-owner";
import { rotateCommand } from "./commands/rotate";
import { updateCommand } from "./commands/update";
import { exportAuditCommand } from "./commands/export-audit";
import { analyticsCommand } from "./commands/analytics";
import { migrateCredentialsCommand } from "./commands/migrate-credentials";
import { SignerConfig } from "./lib/config-v2";
import { credentialStatus, deleteCredential, setCredential } from "./commands/credentials";
import { configureSigner, signerStatus } from "./commands/signer";

const program = new Command();

program
  .name("fheenv")
  .description("Zero-trust .env secrets manager powered by FHE")
  .version("0.5.0")
  .enablePositionalOptions();

// ── fheenv login ──────────────────────────────────────────────────────────────
program
  .command("login")
  .description("Configure the development-only encrypted local signer")
  .option("--migrate", "Encrypt an existing legacy plaintext wallet")
  .action(async (opts) => {
    try {
      await loginCommand({
        migrate: Boolean(opts.migrate),
      });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv init ───────────────────────────────────────────────────────────────
const SEPOLIA_REGISTRY = "0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2";
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const SEPOLIA_CHAIN_ID = 11155111;

function signerConfigFromOptions(opts: Record<string, string | undefined>): SignerConfig {
  switch (opts.signer) {
    case "walletconnect":
      if (!opts.signerCredential) {
        throw new Error("--signer-credential is required for WalletConnect.");
      }
      return {
        type: "walletconnect",
        credentialRef: opts.signerCredential,
        expectedAddress: opts.expectedAddress,
      };
    case "ledger":
      return {
        type: "ledger",
        derivationPath: opts.ledgerPath ?? "44'/60'/0'/0/0",
        expectedAddress: opts.expectedAddress,
      };
    case "aws-kms":
      if (!opts.kmsKeyId || !opts.expectedAddress) {
        throw new Error("--kms-key-id and --expected-address are required for AWS KMS.");
      }
      return {
        type: "aws-kms",
        keyId: opts.kmsKeyId,
        expectedAddress: opts.expectedAddress,
      };
    case "external":
      if (!opts.externalProvider || !opts.expectedAddress) {
        throw new Error(
          "--external-provider and --expected-address are required for an external signer.",
        );
      }
      return {
        type: "external",
        provider: opts.externalProvider,
        expectedAddress: opts.expectedAddress,
      };
    case "local-encrypted":
      return { type: "local-encrypted", expectedAddress: opts.expectedAddress };
    default:
      throw new Error(`Unsupported signer: ${opts.signer ?? ""}`);
  }
}

program
  .command("init")
  .description("Create a new fheENV project on-chain and write .fheenv.json")
  .requiredOption("-n, --name <name>", "Project name")
  .option("-r, --registry <address>", "Registry contract address", SEPOLIA_REGISTRY)
  .option("--rpc <url>", "RPC URL (or set FHEENV_RPC)", process.env.FHEENV_RPC ?? SEPOLIA_RPC)
  .option("--chain-id <id>", "Chain ID", (v) => parseInt(v), SEPOLIA_CHAIN_ID)
  .option(
    "--storage-credential <reference>",
    "Pinata credential reference",
    "keyring://storage/pinata/default",
  )
  .option(
    "--signer <type>",
    "walletconnect, ledger, aws-kms, external, or local-encrypted",
    "walletconnect",
  )
  .option("--security-mode <mode>", "production or development", "production")
  .option(
    "--signer-credential <reference>",
    "WalletConnect project ID credential reference",
    "keyring://walletconnect/project-id",
  )
  .option("--expected-address <address>", "Expected signer address")
  .option("--ledger-path <path>", "Ledger derivation path")
  .option("--kms-key-id <id>", "AWS KMS key ID or ARN")
  .option("--external-provider <name>", "Configured external signer provider")
  .option("-e, --env <envName>", "Default environment name", "production")
  .option("--analytics", "Opt in to anonymous, minimal CLI product analytics")
  .action(async (opts) => {
    try {
      await initCommand({
        name: opts.name,
        registry: opts.registry,
        rpcUrl: opts.rpc,
        chainId: opts.chainId,
        storageCredential: opts.storageCredential,
        signer: signerConfigFromOptions(opts),
        securityMode: opts.securityMode,
        envName: opts.env,
        analytics: Boolean(opts.analytics),
      });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv push ───────────────────────────────────────────────────────────────
program
  .command("push")
  .description("Encrypt and push .env to IPFS, write FHE key handles to chain")
  .option("-f, --file <path>", "Path to .env file", ".env")
  .option("-e, --env <envName>", "Environment name", "production")
  .action(async (opts) => {
    try {
      await pushCommand({ envFile: opts.file, envName: opts.env });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv pull ───────────────────────────────────────────────────────────────
program
  .command("pull")
  .description("Decrypt env from chain and IPFS, write to .env.local")
  .option("-e, --env <envName>", "Environment name", "production")
  .option("-o, --output <path>", "Output file path", ".env.local")
  .action(async (opts) => {
    try {
      await pullCommand({ envName: opts.env, output: opts.output });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv run ────────────────────────────────────────────────────────────────
program
  .command("run")
  .description("Decrypt env and inject into child process env (no disk write)")
  .option("-e, --env <envName>", "Environment name", "production")
  .allowUnknownOption()
  .passThroughOptions()
  .argument("[command...]", "Command to run")
  .action(async (command: string[], opts: { env?: string }) => {
    try {
      await runCommand({ envName: opts.env, command });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv team add ───────────────────────────────────────────────────────────
const team = program.command("team").description("Manage team access");

team
  .command("add")
  .description("Grant an address access to decrypt a specific environment")
  .requiredOption("-m, --member <address>", "Ethereum address to grant access")
  .option("-e, --env <envName>", "Environment name", "production")
  .action(async (opts) => {
    try {
      await teamAddCommand({ member: opts.member, envName: opts.env });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv team remove ────────────────────────────────────────────────────────
team
  .command("remove")
  .description("Revoke an address and rotate the environment key")
  .requiredOption("-m, --member <address>", "Ethereum address to revoke")
  .option("-e, --env <envName>", "Environment name", "production")
  .option("-f, --file <path>", "Path to the plaintext env file to re-encrypt", ".env")
  .option("--no-rotate", "Skip rotation explicitly (removed member keeps current FHE access)")
  .action(async (opts) => {
    try {
      await teamRemoveCommand({
        member: opts.member,
        envName: opts.env,
        envFile: opts.file,
        noRotate: Boolean(opts.noRotate),
      });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv team remove-owner ──────────────────────────────────────────────────
team
  .command("remove-owner")
  .description("Remove a co-owner from the project (primary owner only)")
  .requiredOption("-o, --owner <address>", "Ethereum address of the co-owner to remove")
  .action(async (opts) => {
    try {
      await teamRemoveOwnerCommand({ owner: opts.owner });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv rotate ─────────────────────────────────────────────────────────────
program
  .command("rotate")
  .description(
    "Rotate AES key: re-encrypt env with a fresh key and re-grant access to all current members",
  )
  .option("-e, --env <envName>", "Environment name", "production")
  .option("-f, --file <path>", "Path to .env file to re-encrypt", ".env")
  .option("--regrant-only", "Regrant current members without creating another version")
  .action(async (opts) => {
    try {
      await rotateCommand({
        envName: opts.env,
        envFile: opts.file,
        regrantOnly: Boolean(opts.regrantOnly),
      });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv update ─────────────────────────────────────────────────────────────
program
  .command("update")
  .description("Download and install the latest fheenv release")
  .action(async () => {
    try {
      await updateCommand();
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

program
  .command("export-audit")
  .description("Export local operational audit records as CSV")
  .option("-o, --output <path>", "Write CSV to a file instead of stdout")
  .option("--from <date>", "Include records on or after this ISO date")
  .option("--to <date>", "Include records on or before this ISO date")
  .action((opts) => {
    try {
      exportAuditCommand({
        output: opts.output,
        from: opts.from,
        to: opts.to,
      });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

const analytics = program.command("analytics").description("Manage anonymous CLI analytics");
analytics.command("enable").action(() => analyticsCommand("enable"));
analytics.command("disable").action(() => analyticsCommand("disable"));
analytics.command("status").action(() => analyticsCommand("status"));

const migrate = program.command("migrate").description("Migrate fheENV project data");
migrate
  .command("credentials")
  .description("Move credentials out of a version-1 project config")
  .requiredOption(
    "--storage-credential <reference>",
    "Writable keyring reference for the Pinata credential",
  )
  .option(
    "--rpc-credential <reference>",
    "Writable keyring reference for a credential-bearing RPC URL",
  )
  .option(
    "--walletconnect-credential <reference>",
    "Migrate into production mode with this WalletConnect project ID reference",
  )
  .option(
    "--development-local-signer",
    "Explicitly retain the encrypted local signer in development mode",
  )
  .option("--dry-run", "Validate and print the value-free migration plan")
  .action(async (opts) => {
    try {
      if (Boolean(opts.walletconnectCredential) === Boolean(opts.developmentLocalSigner)) {
        throw new Error(
          "Select exactly one: --walletconnect-credential or --development-local-signer.",
        );
      }
      await migrateCredentialsCommand({
        credentialRef: opts.storageCredential,
        rpcCredentialRef: opts.rpcCredential,
        securityMode: opts.walletconnectCredential ? "production" : "development",
        signer: opts.walletconnectCredential
          ? {
              type: "walletconnect",
              credentialRef: opts.walletconnectCredential,
            }
          : { type: "local-encrypted" },
        dryRun: Boolean(opts.dryRun),
      });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

const credentials = program.command("credentials").description("Manage credential references");
credentials
  .command("set")
  .argument("<reference>", "Writable keyring:// credential reference")
  .option("--stdin", "Read the credential from stdin explicitly")
  .action(async (reference, opts) => {
    try {
      console.log(JSON.stringify(await setCredential({ reference, stdin: Boolean(opts.stdin) })));
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exitCode = 1;
    }
  });
credentials
  .command("status")
  .argument("[reference]", "Credential reference to inspect")
  .action(async (reference) => {
    try {
      console.log(JSON.stringify(await credentialStatus({ reference }), null, 2));
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exitCode = 1;
    }
  });
credentials
  .command("delete")
  .argument("<reference>", "Writable keyring:// credential reference")
  .option("--yes", "Confirm deletion in non-interactive use")
  .action(async (reference, opts) => {
    try {
      console.log(JSON.stringify(await deleteCredential({ reference, yes: Boolean(opts.yes) })));
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exitCode = 1;
    }
  });

const signer = program.command("signer").description("Configure the project signer");
signer
  .command("configure")
  .argument("<type>", "walletconnect, ledger, aws-kms, external, or local-encrypted")
  .option("--credential <reference>", "WalletConnect project ID credential reference")
  .option("--derivation-path <path>", "Ledger derivation path")
  .option("--key-id <id>", "AWS KMS key ID or ARN")
  .option("--provider <name>", "External signer provider name")
  .option("--expected-address <address>", "Expected signer address")
  .action(async (type, opts) => {
    try {
      console.log(
        JSON.stringify(
          await configureSigner({
            type,
            credential: opts.credential,
            derivationPath: opts.derivationPath,
            keyId: opts.keyId,
            provider: opts.provider,
            expectedAddress: opts.expectedAddress,
          }),
          null,
          2,
        ),
      );
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exitCode = 1;
    }
  });
signer.command("status").action(() => {
  try {
    console.log(JSON.stringify(signerStatus(), null, 2));
  } catch (err) {
    console.error(chalk.red(`Error: ${(err as Error).message}`));
    process.exitCode = 1;
  }
});

program.parse(process.argv);
