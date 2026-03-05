import { searchMemories, updateMemory } from "./storage.js";
import { logger } from "../utils/logger.js";
import type { Config, MemoryWithScore } from "../types/index.js";

export interface DedupResult {
  isDuplicate: boolean;
  existingMemory?: MemoryWithScore;
}

export function checkDuplicate(
  projectId: string,
  embedding: Float32Array,
  config: Config,
  newContent?: string,
): DedupResult {
  if (!config.auto_dedup) {
    return { isDuplicate: false };
  }

  const results = searchMemories(projectId, embedding, 1);

  if (results.length > 0 && results[0].score >= config.dedup_threshold) {
    // Content-length ratio check: if lengths differ by >3x, not a duplicate
    // even if embeddings are similar (prevents short vs long content matching)
    if (newContent && results[0].content) {
      const lengthRatio =
        Math.max(newContent.length, results[0].content.length) /
        Math.max(1, Math.min(newContent.length, results[0].content.length));
      if (lengthRatio > 3) {
        logger.debug(
          `Skipping dedup — content length ratio too high (${lengthRatio.toFixed(1)}x)`,
        );
        return { isDuplicate: false };
      }
    }

    logger.debug(
      `Duplicate detected (score: ${results[0].score.toFixed(3)}, threshold: ${config.dedup_threshold})`,
    );
    return { isDuplicate: true, existingMemory: results[0] };
  }

  return { isDuplicate: false };
}

export function updateDuplicate(
  existingId: string,
  newContent: string,
  embedding: Float32Array,
): void {
  updateMemory(existingId, newContent, embedding);
  logger.debug("Updated duplicate memory:", existingId);
}
