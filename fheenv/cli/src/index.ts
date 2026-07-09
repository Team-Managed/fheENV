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
import { rotateCommand } from "./commands/rotate";
import { updateCommand } from "./commands/update";
import { rotatorAddCommand, rotatorRemoveCommand } from "./commands/rotator";
import { rotateCheckCommand } from "./commands/rotate-check";
import { indexAuditCommand } from "./commands/index-audit";
import { exportAuditCommand } from "./commands/export-audit";

const program = new Command();

program
  .name("fheenv")
  .description("Zero-trust .env secrets manager powered by FHE")
  .version("0.5.0")
  .enablePositionalOptions();

// ── fheenv login ──────────────────────────────────────────────────────────────
program
  .command("login")
  .description("Save your Ethereum private key to ~/.fheenv/wallet.json")
  .option(
    "-k, --key <privateKey>",
    "(deprecated) inline private key — visible in shell history. Use stdin or FHEENV_PRIVATE_KEY instead",
  )
  .action(async (opts) => {
    try {
      await loginCommand({ key: opts.key as string | undefined });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv init ───────────────────────────────────────────────────────────────
const SEPOLIA_REGISTRY = "0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2";
const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
const SEPOLIA_CHAIN_ID = 11155111;

program
  .command("init")
  .description("Create a new fheENV project on-chain and write .fheenv.json")
  .requiredOption("-n, --name <name>", "Project name")
  .option("-r, --registry <address>", "Registry contract address", SEPOLIA_REGISTRY)
  .option("--rpc <url>", "RPC URL (or set FHEENV_RPC)", process.env.FHEENV_RPC ?? SEPOLIA_RPC)
  .option("--chain-id <id>", "Chain ID", (v) => parseInt(v), SEPOLIA_CHAIN_ID)
  .option(
    "--pinata-jwt <jwt>",
    "Pinata JWT for IPFS uploads (or set FHEENV_PINATA_JWT)",
    process.env.FHEENV_PINATA_JWT,
  )
  .option("-e, --env <envName>", "Default environment name", "production")
  .action(async (opts) => {
    try {
      await initCommand({
        name: opts.name,
        registry: opts.registry,
        rpcUrl: opts.rpc,
        chainId: opts.chainId,
        pinataJwt: opts.pinataJwt,
        envName: opts.env,
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
  .option(
    "--expires <duration>",
    "Time-limited grant for CI/CD service accounts: e.g. 30d, 8h, 90m (SOC 2 CC6.3)",
  )
  .action(async (opts) => {
    try {
      await teamAddCommand({ member: opts.member, envName: opts.env, expires: opts.expires });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv team remove ────────────────────────────────────────────────────────
team
  .command("remove")
  .description(
    "Revoke access and automatically rotate the AES key (cryptographic lockout). " +
      "Use --no-rotate only when batch-removing multiple members.",
  )
  .requiredOption("-m, --member <address>", "Ethereum address to revoke")
  .option("-e, --env <envName>", "Environment name", "production")
  .option("-f, --file <path>", "Path to .env file to re-encrypt during auto-rotation", ".env")
  .option(
    "--no-rotate",
    "Skip auto-rotation (UNSAFE — member retains FHE decrypt access until you run `fheenv rotate`)",
  )
  .action(async (opts) => {
    try {
      await teamRemoveCommand({
        member: opts.member,
        envName: opts.env,
        envFile: opts.file,
        noRotate: opts.noRotate,
      });
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
  .action(async (opts) => {
    try {
      await rotateCommand({ envName: opts.env, envFile: opts.file });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv rotator ────────────────────────────────────────────────────
const rotator = program
  .command("rotator")
  .description("Manage the Rotator automation role (SOC 2 CC6.1)");

rotator
  .command("add")
  .description(
    "Grant the Rotator role to an address (allows updateEnvironment + batchGrantAccess, no team management)",
  )
  .requiredOption("-a, --address <address>", "Ethereum address to grant the Rotator role")
  .option("-p, --project-id <id>", "Project ID (defaults to .fheenv.json value)")
  .action(async (opts) => {
    try {
      await rotatorAddCommand({ address: opts.address, projectId: opts.projectId });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

rotator
  .command("remove")
  .description("Revoke the Rotator role from an address")
  .requiredOption("-a, --address <address>", "Ethereum address to revoke the Rotator role from")
  .option("-p, --project-id <id>", "Project ID (defaults to .fheenv.json value)")
  .action(async (opts) => {
    try {
      await rotatorRemoveCommand({ address: opts.address, projectId: opts.projectId });
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv rotate-check ───────────────────────────────────────────────────────
program
  .command("rotate-check")
  .description(
    "Check rotation policy and rotate overdue environments. " +
      "Intended for scheduled GitHub Actions workflows — exits with code 1 on any failure.",
  )
  .action(async () => {
    try {
      await rotateCheckCommand();
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv index-audit ──────────────────────────────────────────────────
program
  .command("index-audit")
  .description(
    "Index on-chain events into ~/.fheenv/audit.log (SOC 2 CC7.2 evidence). " +
      "Run before exporting to ensure the log is current.",
  )
  .action(async () => {
    try {
      await indexAuditCommand();
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv export-audit ────────────────────────────────────────────────
program
  .command("export-audit")
  .description(
    "Export ~/.fheenv/audit.log as CSV for SOC 2 auditor review (CC6.3 / CC7.2 evidence).",
  )
  .option("-o, --output <file>", "Write to a file instead of stdout")
  .option("--from <date>", "Include records on or after this date (ISO 8601, e.g. 2026-01-01)")
  .option("--to <date>", "Include records on or before this date (ISO 8601, e.g. 2026-07-08)")
  .option("--format <fmt>", "Output format: csv (default) or table", "csv")
  .action((opts) => {
    try {
      exportAuditCommand({
        output: opts.output,
        from: opts.from,
        to: opts.to,
        format: opts.format,
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

program.parse(process.argv);
