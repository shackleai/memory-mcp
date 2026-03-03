import { readFileSync, existsSync } from "node:fs";
import { parse } from "yaml";
import { getStoragePath, getConfigPath } from "./paths.js";
import { logger } from "./logger.js";
import type { Config } from "../types/index.js";

const DEFAULT_CONFIG: Config = {
  storage_path: getStoragePath(),
  embedding: {
    provider: "local",
  },
  max_memories_per_project: 10000,
  max_session_history_days: 90,
  auto_init: true,
  auto_dedup: true,
  dedup_threshold: 0.9,
};

export async function loadConfig(): Promise<Config> {
  const storagePath = getStoragePath();
  const configPath = getConfigPath(storagePath);

  if (!existsSync(configPath)) {
    logger.info("No config file found, using defaults");
    return { ...DEFAULT_CONFIG };
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = parse(raw) as Partial<Config>;
    const config: Config = {
      ...DEFAULT_CONFIG,
      ...parsed,
      embedding: {
        ...DEFAULT_CONFIG.embedding,
        ...(parsed.embedding || {}),
      },
    };

    if (parsed.storage_path) {
      config.storage_path = getStoragePath(parsed.storage_path);
    }

    logger.info("Config loaded from", configPath);
    return config;
  } catch (err) {
    logger.warn("Failed to parse config, using defaults:", err);
    return { ...DEFAULT_CONFIG };
  }
}
