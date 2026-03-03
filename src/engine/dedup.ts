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
): DedupResult {
  if (!config.auto_dedup) {
    return { isDuplicate: false };
  }

  const results = searchMemories(projectId, embedding, 1);

  if (results.length > 0 && results[0].score >= config.dedup_threshold) {
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
