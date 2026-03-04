import { readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { getSessionsDir } from "../utils/paths.js";
import { logger } from "../utils/logger.js";
import type { Config } from "../types/index.js";

/**
 * Remove session Markdown files older than max_session_history_days.
 * Sessions are stored as YYYY-MM-DD.md files.
 */
export function archiveOldSessions(
  config: Config,
  projectName: string,
): { archived: number; kept: number } {
  const sessionsDir = getSessionsDir(config.storage_path, projectName);
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - config.max_session_history_days);
  const cutoffStr = cutoffDate.toISOString().split("T")[0];

  let archived = 0;
  let kept = 0;

  try {
    const files = readdirSync(sessionsDir).filter((f) => f.endsWith(".md"));

    for (const file of files) {
      const dateStr = file.replace(".md", "");
      // Only process files that match YYYY-MM-DD pattern
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
        kept++;
        continue;
      }

      if (dateStr < cutoffStr) {
        unlinkSync(join(sessionsDir, file));
        archived++;
        logger.debug("Archived old session:", file);
      } else {
        kept++;
      }
    }
  } catch {
    // Directory might not exist yet — that's fine
  }

  if (archived > 0) {
    logger.info(`Archived ${archived} old sessions for ${projectName} (kept ${kept})`);
  }

  return { archived, kept };
}
