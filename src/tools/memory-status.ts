import { getMemory, updateMemoryStatus, getActiveOrMostRecentProject, getTodosByStatus } from "../engine/storage.js";
import type { Config, TodoStatus } from "../types/index.js";

interface MemoryStatusParams {
  id?: string;
  status?: TodoStatus;
  list_status?: TodoStatus;
}

export async function handleMemoryStatus(params: MemoryStatusParams, _config: Config) {
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

  // List mode: return todos filtered by status
  if (params.list_status || (!params.id && !params.status)) {
    const todos = getTodosByStatus(project.id, params.list_status);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            todos: todos.map((t) => ({
              id: t.id,
              content: t.content,
              status: t.status || "pending",
              importance: t.importance,
              tags: t.tags,
              created_at: t.created_at,
            })),
            count: todos.length,
            project: project.name,
          }),
        },
      ],
    };
  }

  // Update mode: change status of a specific memory
  if (!params.id || !params.status) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "Provide both 'id' and 'status' to update, or 'list_status' to list." }),
        },
      ],
    };
  }

  const memory = getMemory(params.id);
  if (!memory) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ updated: false, error: "Memory not found" }),
        },
      ],
    };
  }

  const updated = updateMemoryStatus(params.id, params.status);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          updated,
          id: params.id,
          previous_status: memory.status || "pending",
          new_status: params.status,
          content: memory.content,
        }),
      },
    ],
  };
}
