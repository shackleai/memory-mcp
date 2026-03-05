import { getActiveOrMostRecentProject, exportProjectMemories } from "../engine/storage.js";
import type { Config } from "../types/index.js";

export async function handleMemoryExport(_config: Config) {
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

  const memories = exportProjectMemories(project.id);

  const exportData = {
    version: "1.0",
    exported_at: new Date().toISOString(),
    project: {
      name: project.name,
      path: project.path,
      tech_stack: project.tech_stack,
    },
    memories: memories.map((m) => ({
      id: m.id,
      content: m.content,
      category: m.category,
      importance: m.importance,
      tags: m.tags,
      status: m.status,
      session_id: m.session_id,
      created_at: m.created_at,
      updated_at: m.updated_at,
    })),
    count: memories.length,
  };

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(exportData),
      },
    ],
  };
}
