/**
 * fheenv index-audit
 *
 * Reads on-chain events for this project and appends them to
 * ~/.fheenv/audit.log as JSONL records. Deduplicates by txHash so
 * re-running is safe. Tracks the last indexed block in
 * ~/.fheenv/audit-state.json so each run only queries new blocks.
 *
 * Run before every audit window to ensure the log is current:
 *   fheenv index-audit
 *
 * SOC 2 CC7.2 — provides an exportable, human-readable record that
 * aggregates tamper-evident on-chain data into auditor-reviewable form.
 */

import fs from "fs";
import path from "path";
import os from "os";
import chalk from "chalk";
import ora from "ora";
import { readConfig } from "../lib/config";
import { createPublicClient, http, decodeEventLog, type Address, type PublicClient } from "viem";
import { logAuditEvent, type AuditEvent } from "@fheenv/core";

// ── Paths ──────────────────────────────────────────────────────────────────────

const FHEENV_DIR = path.join(os.homedir(), ".fheenv");
const STATE_FILE = path.join(FHEENV_DIR, "audit-state.json");

// ── Minimal event ABIs for getLogs ────────────────────────────────────────────

const EVENTS = [
  {
    name: "EnvironmentUpdated",
    abi: {
      name: "EnvironmentUpdated",
      type: "event",
      inputs: [
        { name: "projectId", type: "uint256", indexed: true },
        { name: "envHash", type: "bytes32", indexed: true },
        { name: "blobCid", type: "string", indexed: false },
        { name: "version", type: "uint256", indexed: false },
      ],
    },
  },
  {
    name: "AccessGranted",
    abi: {
      name: "AccessGranted",
      type: "event",
      inputs: [
        { name: "projectId", type: "uint256", indexed: true },
        { name: "envHash", type: "bytes32", indexed: true },
        { name: "member", type: "address", indexed: true },
      ],
    },
  },
  {
    name: "AccessRevoked",
    abi: {
      name: "AccessRevoked",
      type: "event",
      inputs: [
        { name: "projectId", type: "uint256", indexed: true },
        { name: "envHash", type: "bytes32", indexed: true },
        { name: "member", type: "address", indexed: true },
      ],
    },
  },
  {
    name: "AccessGrantedWithExpiry",
    abi: {
      name: "AccessGrantedWithExpiry",
      type: "event",
      inputs: [
        { name: "projectId", type: "uint256", indexed: true },
        { name: "envHash", type: "bytes32", indexed: true },
        { name: "member", type: "address", indexed: true },
        { name: "expiresAt", type: "uint256", indexed: false },
      ],
    },
  },
  {
    name: "RotatorGranted",
    abi: {
      name: "RotatorGranted",
      type: "event",
      inputs: [
        { name: "projectId", type: "uint256", indexed: true },
        { name: "rotator", type: "address", indexed: true },
      ],
    },
  },
  {
    name: "RotatorRevoked",
    abi: {
      name: "RotatorRevoked",
      type: "event",
      inputs: [
        { name: "projectId", type: "uint256", indexed: true },
        { name: "rotator", type: "address", indexed: true },
      ],
    },
  },
] as const;

// ── State helpers ─────────────────────────────────────────────────────────────

function readLastIndexedBlock(): bigint {
  try {
    if (fs.existsSync(STATE_FILE)) {
      const s = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as { lastIndexedBlock?: string };
      if (s.lastIndexedBlock) return BigInt(s.lastIndexedBlock);
    }
  } catch {
    /* start from genesis */
  }
  return 0n;
}

function writeLastIndexedBlock(block: bigint): void {
  if (!fs.existsSync(FHEENV_DIR)) fs.mkdirSync(FHEENV_DIR, { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify({ lastIndexedBlock: block.toString() }, null, 2));
}

// ── Existing log IDs to deduplicate ─────────────────────────────────────────

function loadExistingLogIds(): Set<string> {
  const LOG_PATH = path.join(FHEENV_DIR, "audit.log");
  const seen = new Set<string>();
  if (!fs.existsSync(LOG_PATH)) return seen;
  for (const line of fs.readFileSync(LOG_PATH, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const rec = JSON.parse(trimmed) as { txHash?: string; logIndex?: number };
      if (rec.txHash) {
        const id = rec.logIndex !== undefined ? `${rec.txHash}-${rec.logIndex}` : rec.txHash;
        seen.add(id);
      }
    } catch {
      /* skip malformed lines */
    }
  }
  return seen;
}

// ── Main ──────────────────────────────────────────────────────────────────────

export interface IndexAuditOptions {
  tail?: number;
}

export async function indexAuditCommand(opts: IndexAuditOptions = {}): Promise<void> {
  const config = readConfig();
  const registryAddress = config.registryAddress as Address;
  const projectId = BigInt(config.projectId);

  const chain = {
    id: config.chainId,
    name: `chain-${config.chainId}`,
    nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
    rpcUrls: { default: { http: [config.rpcUrl] } },
  };
  const publicClient: PublicClient = createPublicClient({ chain, transport: http(config.rpcUrl) });

  let fromBlock = readLastIndexedBlock() + (readLastIndexedBlock() > 0n ? 1n : 0n);
  const latestBlock = await publicClient.getBlockNumber();

  // If the user specifies a tail (e.g. --tail 1000), always scan only the last N blocks
  // to intentionally bypass archive node limits on old projects.
  if (opts.tail && opts.tail > 0) {
    const tailBig = BigInt(opts.tail);
    fromBlock = latestBlock > tailBig ? latestBlock - tailBig : 0n;
  } else if (fromBlock === 0n) {
    // Fallback: If no state exists and no tail specified, start from the exact block the project was created.
    if (config.deployedAtBlock !== undefined) {
      fromBlock = BigInt(config.deployedAtBlock);
    } else {
      fromBlock = latestBlock > 10000n ? latestBlock - 10000n : 0n;
    }
  }

  if (fromBlock > latestBlock) {
    console.log(chalk.dim(`Audit log is current (last indexed block: ${fromBlock - 1n})`));
    return;
  }

  const spinner = ora(
    `Indexing blocks ${fromBlock}–${latestBlock} for project ${config.projectId}…`,
  ).start();

  const seen = loadExistingLogIds();
  let newRecords = 0;

  const projectIdHex = ("0x" + projectId.toString(16).padStart(64, "0")) as `0x${string}`;

  // --- NEW BLOCKSCOUT API LOGIC ---
  // We use the Blockscout REST API to bypass RPC archive node restrictions and rate limits.
  // This fetches the entire history in a single HTTP request!
  const apiUrl = `https://eth-sepolia.blockscout.com/api?module=logs&action=getLogs&address=${registryAddress}&fromBlock=${fromBlock}&toBlock=latest`;

  try {
    const res = await fetch(apiUrl);
    const data = await res.json();

    if (data.status === "1" && Array.isArray(data.result)) {
      for (const rawLog of data.result) {
        // Filter out logs that don't belong to our project
        // The projectId is always the first indexed argument (topics[1]) in our events
        if (!rawLog.topics || rawLog.topics[1] !== projectIdHex) {
          continue;
        }

        let decoded: any = null;
        let eventName = "";

        // Try to decode against our known ABIs
        for (const ev of EVENTS) {
          try {
            decoded = decodeEventLog({
              abi: [ev.abi],
              data: rawLog.data,
              topics: rawLog.topics,
            });
            eventName = ev.name;
            break;
          } catch {
            // Not this event type, try the next one
          }
        }

        if (!decoded) continue; // Unrecognized event

        const txHash = rawLog.transactionHash ?? "";
        const logIdx = rawLog.logIndex ? parseInt(rawLog.logIndex, 16) : undefined;
        const logId = logIdx !== undefined ? `${txHash}-${logIdx}` : txHash;

        if (seen.has(logId)) continue;
        seen.add(logId);

        const args = decoded.args ?? {};

        const record: AuditEvent & { source: string; blockNumber: string } = {
          source: "on_chain",
          blockNumber: parseInt(rawLog.blockNumber, 16).toString(),
          txHash,
          logIndex: logIdx,
          actor: "", // not available from log; enriched below
          action: eventNameToAction(eventName),
          projectId: config.projectId.toString(),
          envName: reverseEnvHash(String(args.envHash ?? ""), projectIdHex),
          target: String(args.member ?? args.rotator ?? ""),
          newCid: String(args.blobCid ?? ""),
        };

        logAuditEvent(record);
        newRecords++;
      }
    } else if (data.message === "No records found") {
      // It's perfectly fine if there are no logs in this range
    } else {
      console.warn(
        chalk.yellow(`\nAPI Warning: ${data.message || "Unknown error from Blockscout"}`),
      );
    }
  } catch (err: any) {
    console.error(chalk.red(`\nFailed to fetch from Blockscout API: ${err.message}`));
  }

  // --- LEGACY RPC LOGIC (COMMENTED OUT AS FALLBACK) ---
  /*
  // Set to 2000 to comply with Infura's strict getLogs block range limits
  const MAX_BLOCK_RANGE = 2000n;

  for (const ev of EVENTS) {
    for (
      let currentFrom = fromBlock;
      currentFrom <= latestBlock;
      currentFrom += MAX_BLOCK_RANGE + 1n
    ) {
      let currentTo = currentFrom + MAX_BLOCK_RANGE;
      if (currentTo > latestBlock) currentTo = latestBlock;

      let logs: any[] = [];
      let retries = 0;
      while (true) {
        try {
          logs = await publicClient.getLogs({
            address: registryAddress,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            event: ev.abi as any,
            args: { projectId } as Record<string, unknown>,
            fromBlock: currentFrom,
            toBlock: currentTo,
          });
          // Base delay to be nice to free tiers
          await new Promise((resolve) => setTimeout(resolve, 200));
          break;
        } catch (err: any) {
          if (err.message && err.message.includes("429") && retries < 5) {
            retries++;
            // Exponential backoff: 2s, 4s, 8s...
            const delay = 1000 * Math.pow(2, retries);
            await new Promise((resolve) => setTimeout(resolve, delay));
          } else {
            throw err;
          }
        }
      }

      for (const log of logs) {
        const txHash = log.transactionHash ?? "";
        const logIdx =
          log.logIndex !== null && log.logIndex !== undefined ? Number(log.logIndex) : undefined;
        const logId = logIdx !== undefined ? `${txHash}-${logIdx}` : txHash;
        if (seen.has(logId)) continue;
        seen.add(logId);

        const args = (log as unknown as { args?: Record<string, unknown> }).args ?? {};

        // Map on-chain event to AuditEvent shape
        const record: AuditEvent & { source: string; blockNumber: string } = {
          source: "on_chain",
          blockNumber: log.blockNumber?.toString() ?? "",
          txHash,
          logIndex: logIdx,
          actor: "", // not available from log; enriched below
          action: eventNameToAction(ev.name),
          projectId: config.projectId.toString(),
          envName: reverseEnvHash(String(args.envHash ?? ""), projectIdHex),
          target: String(args.member ?? args.rotator ?? ""),
          newCid: String(args.blobCid ?? ""),
        };

        logAuditEvent(record);
        newRecords++;
      }
    }
  }
  */

  writeLastIndexedBlock(latestBlock);
  spinner.succeed(
    chalk.green(
      `Indexed ${newRecords} new event${newRecords !== 1 ? "s" : ""} ` +
        `(blocks ${fromBlock}–${latestBlock})`,
    ),
  );
  if (newRecords > 0) {
    console.log(chalk.dim(`  Log: ~/.fheenv/audit.log`));
  }
}

function eventNameToAction(name: string): AuditEvent["action"] {
  const map: Record<string, AuditEvent["action"]> = {
    EnvironmentUpdated: "key_rotated",
    AccessGranted: "member_granted",
    AccessGrantedWithExpiry: "member_granted",
    AccessRevoked: "member_revoked",
    RotatorGranted: "member_granted",
    RotatorRevoked: "member_revoked",
  };
  return map[name] ?? "key_rotated";
}

// Best-effort: return the env hash as-is if we can't reverse it
function reverseEnvHash(envHash: string, _projectIdHex: string): string | undefined {
  const known = ["production", "staging", "development", "preview", "test"];
  const { keccak256, toBytes } = require("viem");
  for (const name of known) {
    try {
      if (keccak256(toBytes(name)) === envHash) return name;
    } catch {
      /* skip */
    }
  }
  return undefined;
}
