import { getActiveOrMostRecentProject, archiveDoneTodos, deleteStaleMemories } from "../engine/storage.js";
import type { Config } from "../types/index.js";

interface MemoryCleanupParams {
  archive_done_todos?: boolean;
  delete_stale_days?: number;
  max_importance?: "low" | "medium";
}

export async function handleMemoryCleanup(params: MemoryCleanupParams, _config: Config) {
  const project = getActiveOrMostRecentProject();
  if (!project) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "No active project" }),
        },
      ],
    };
  }

  let archivedTodos = 0;
  let deletedStale = 0;

  // Archive completed TODOs (default: true)
  if (params.archive_done_todos !== false) {
    archivedTodos = archiveDoneTodos(project.id);
  }

  // Delete stale low-importance memories older than N days
  if (params.delete_stale_days && params.delete_stale_days > 0) {
    const maxImportance = params.max_importance || "low";
    deletedStale = deleteStaleMemories(project.id, params.delete_stale_days, maxImportance);
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          project: project.name,
          archived_done_todos: archivedTodos,
          deleted_stale: deletedStale,
          _hint: archivedTodos + deletedStale === 0
            ? "Memory store is clean — nothing to archive or delete."
            : `Cleaned up ${archivedTodos + deletedStale} memories.`,
        }),
      },
    ],
  };
}
