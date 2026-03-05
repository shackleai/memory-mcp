import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getStoragePath } from "../utils/paths.js";
import { logger } from "../utils/logger.js";

const CURRENT_VERSION = "0.4.1";
const NPM_REGISTRY_URL = "https://registry.npmjs.org/@shackleai/memory-mcp/latest";
const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000; // once per day

interface VersionCache {
  latest_version: string;
  checked_at: string;
}

interface NudgeState {
  last_upgrade_nudge: string | null; // ISO date
  last_version_nudge: string | null; // ISO date
  session_count: number;
}

function getNudgePath(): string {
  return join(getStoragePath(), "nudge.json");
}

function loadNudgeState(): NudgeState {
  const path = getNudgePath();
  if (!existsSync(path)) {
    return { last_upgrade_nudge: null, last_version_nudge: null, session_count: 0 };
  }
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return { last_upgrade_nudge: null, last_version_nudge: null, session_count: 0 };
  }
}

function saveNudgeState(state: NudgeState): void {
  try {
    writeFileSync(getNudgePath(), JSON.stringify(state), "utf-8");
  } catch {
    // Non-fatal — nudge state is best-effort
  }
}

function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
  }
  return 0;
}

/**
 * Check npm registry for newer version. Cached for 24 hours.
 * Non-blocking, non-fatal — never delays startup.
 */
export async function checkForUpdate(): Promise<string | null> {
  const cachePath = join(getStoragePath(), "version-cache.json");

  // Check cache first
  if (existsSync(cachePath)) {
    try {
      const cache: VersionCache = JSON.parse(readFileSync(cachePath, "utf-8"));
      const age = Date.now() - new Date(cache.checked_at).getTime();
      if (age < CHECK_INTERVAL_MS) {
        // Cache is fresh — use it
        if (compareVersions(CURRENT_VERSION, cache.latest_version) < 0) {
          return cache.latest_version;
        }
        return null;
      }
    } catch {
      // Corrupted cache — fetch fresh
    }
  }

  // Fetch from npm registry (with timeout)
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000); // 5s timeout

    const response = await fetch(NPM_REGISTRY_URL, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    });
    clearTimeout(timeout);

    if (!response.ok) return null;

    const data = (await response.json()) as { version: string };
    const latestVersion = data.version;

    // Cache the result
    const cache: VersionCache = {
      latest_version: latestVersion,
      checked_at: new Date().toISOString(),
    };
    try {
      writeFileSync(cachePath, JSON.stringify(cache), "utf-8");
    } catch {
      // Non-fatal
    }

    if (compareVersions(CURRENT_VERSION, latestVersion) < 0) {
      return latestVersion;
    }
  } catch {
    // Network error, offline, timeout — all fine, skip silently
  }

  return null;
}

/**
 * Generate context-aware nudge hint for tool responses.
 * Returns null if no nudge is appropriate right now.
 * Max one nudge per session (tracked via state file).
 */
export function getUsageNudge(memoryCount: number): string | null {
  const state = loadNudgeState();
  const today = new Date().toISOString().split("T")[0];

  // Increment session count
  state.session_count++;
  saveNudgeState(state);

  // Don't nudge in first 3 sessions — let user get comfortable
  if (state.session_count < 3) return null;

  // Only nudge once per day max
  if (state.last_upgrade_nudge === today) return null;

  let nudge: string | null = null;

  if (memoryCount >= 1000) {
    nudge =
      `You have ${memoryCount} memories. Local search may slow down. ` +
      `ShackleAI Cloud offers faster pgvector search + multi-device sync. ` +
      `Learn more: https://shackleai.com/memory`;
  } else if (memoryCount >= 500) {
    nudge =
      `Growing memory store (${memoryCount} memories). ` +
      `ShackleAI Cloud syncs across all your machines automatically. ` +
      `Details: https://shackleai.com/memory`;
  }

  if (nudge) {
    state.last_upgrade_nudge = today;
    saveNudgeState(state);
  }

  return nudge;
}

/**
 * Get version update message for stderr logging on startup.
 */
export function getVersionUpdateMessage(latestVersion: string): string {
  return (
    `Update available: ${CURRENT_VERSION} → ${latestVersion}. ` +
    `Run: npx @shackleai/memory-mcp@latest setup`
  );
}

export function getCurrentVersion(): string {
  return CURRENT_VERSION;
}
