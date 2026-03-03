import { describe, it, expect } from "vitest";
import { join } from "node:path";
import { homedir } from "node:os";

describe("paths", () => {
  it("should resolve default storage path to ~/.shackleai", async () => {
    const { getStoragePath } = await import("../src/utils/paths.js");
    const path = getStoragePath();
    expect(path).toBe(join(homedir(), ".shackleai"));
  });

  it("should resolve custom storage path", async () => {
    const { getStoragePath } = await import("../src/utils/paths.js");
    const path = getStoragePath("/tmp/custom-shackle");
    expect(path).toBe("/tmp/custom-shackle");
  });
});

describe("logger", () => {
  it("should export info, warn, error, debug methods", async () => {
    const { logger } = await import("../src/utils/logger.js");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
    expect(typeof logger.debug).toBe("function");
  });
});

describe("config", () => {
  it("should return default config when no file exists", async () => {
    const { loadConfig } = await import("../src/utils/config.js");
    const config = await loadConfig();
    expect(config.embedding.provider).toBe("local");
    expect(config.auto_dedup).toBe(true);
    expect(config.dedup_threshold).toBe(0.9);
    expect(config.max_memories_per_project).toBe(10000);
  });
});
