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

const program = new Command();

program
  .name("fheenv")
  .description("Zero-trust .env secrets manager powered by FHE")
  .version("0.1.0")
  .enablePositionalOptions();

// ── fheenv login ──────────────────────────────────────────────────────────────
program
  .command("login")
  .description("Save your Ethereum private key to ~/.fheenv/wallet.json")
  .requiredOption("-k, --key <privateKey>", "0x-prefixed private key")
  .action(async (opts) => {
    try {
      await loginCommand(opts.key);
    } catch (err) {
      console.error(chalk.red(`Error: ${(err as Error).message}`));
      process.exit(1);
    }
  });

// ── fheenv init ───────────────────────────────────────────────────────────────
// All network values baked in — only --name is required.
const SEPOLIA_REGISTRY = "0xb9a29d0Cfb402d91c6f70eF117758C118f00F5B2";
const SEPOLIA_RPC =
  "https://sepolia.infura.io/v3/2f47822adc2844fbae3a6fe15913289f";
const SEPOLIA_CHAIN_ID = 11155111;
const DEFAULT_PINATA_JWT =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySW5mb3JtYXRpb24iOnsiaWQiOiIwODI3NGZlZS1kNTFmLTQ2NzQtOTEwZS0wOGNmMGFhNGJkMjkiLCJlbWFpbCI6Imt1bmFsbWFuaXNoc2hhaEBnbWFpbC5jb20iLCJlbWFpbF92ZXJpZmllZCI6dHJ1ZSwicGluX3BvbGljeSI6eyJyZWdpb25zIjpbeyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJGUkExIn0seyJkZXNpcmVkUmVwbGljYXRpb25Db3VudCI6MSwiaWQiOiJOWUMxIn1dLCJ2ZXJzaW9uIjoxfSwibWZhX2VuYWJsZWQiOmZhbHNlLCJzdGF0dXMiOiJBQ1RJVkUifSwiYXV0aGVudGljYXRpb25UeXBlIjoic2NvcGVkS2V5Iiwic2NvcGVkS2V5S2V5IjoiNDliMTYzZDUxMjU1MjY1MDY2MDQiLCJzY29wZWRLZXlTZWNyZXQiOiI2ODE1ODQ1NDEzNGNiNTliZTE1NTNiMjkxYmIyMGM0ODFkZjJmMjdmM2RhNjYwMDA2Y2JhMDdhMDE5NzIwNjUyIiwiZXhwIjoxODE0Njk1MjQ1fQ.UpixYrkIJsvFW-xWwzXd22aW2pzZDh7aKy-TR54fCOU";

program
  .command("init")
  .description("Create a new fheENV project on-chain and write .fheenv.json")
  .requiredOption("-n, --name <name>", "Project name")
  .option(
    "-r, --registry <address>",
    "Registry contract address",
    SEPOLIA_REGISTRY,
  )
  .option(
    "--rpc <url>",
    "RPC URL (or set FHEENV_RPC)",
    process.env.FHEENV_RPC ?? SEPOLIA_RPC,
  )
  .option("--chain-id <id>", "Chain ID", (v) => parseInt(v), SEPOLIA_CHAIN_ID)
  .option(
    "--pinata-jwt <jwt>",
    "Pinata JWT for IPFS uploads",
    process.env.FHEENV_PINATA_JWT ?? DEFAULT_PINATA_JWT,
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
  .description(
    "Revoke an address's access (⚠️  KEY ROTATION REQUIRED — run push after)",
  )
  .requiredOption("-m, --member <address>", "Ethereum address to revoke")
  .option("-e, --env <envName>", "Environment name", "production")
  .action(async (opts) => {
    try {
      await teamRemoveCommand({ member: opts.member, envName: opts.env });
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

program.parse(process.argv);
