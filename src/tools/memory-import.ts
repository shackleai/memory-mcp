import { v4 as uuidv4 } from "uuid";
import { generateEmbedding } from "../engine/embeddings.js";
import { insertMemory, getActiveOrMostRecentProject } from "../engine/storage.js";
import { appendMemoryToMarkdown } from "../engine/markdown.js";
import { cloudMemoryImport } from "../engine/cloud.js";
import type { Config, Memory, MemoryCategory, Importance, TodoStatus } from "../types/index.js";

interface ImportMemory {
  content: string;
  category: MemoryCategory;
  importance?: Importance;
  tags?: string[];
  status?: TodoStatus;
  created_at?: string;
}

interface MemoryImportParams {
  memories: ImportMemory[];
}

export async function handleMemoryImport(params: MemoryImportParams, config: Config) {
  if (config.provider === "cloud") return cloudMemoryImport(params, config);
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

  if (!params.memories || !Array.isArray(params.memories) || params.memories.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ error: "Provide a non-empty 'memories' array." }),
        },
      ],
    };
  }

  let imported = 0;
  let failed = 0;

  for (const item of params.memories) {
    try {
      const now = new Date().toISOString();
      const embedding = await generateEmbedding(item.content);

      const memory: Memory = {
        id: uuidv4(),
        project_id: project.id,
        content: item.content,
        category: item.category,
        importance: item.importance || "medium",
        tags: item.tags || [],
        source: "import",
        session_date: (item.created_at || now).split("T")[0],
        session_id: null,
        status: item.category === "todo" ? (item.status || "pending") : null,
        hit_count: 0,
        last_accessed_at: null,
        created_at: item.created_at || now,
        updated_at: now,
        is_active: 1,
      };

      insertMemory(memory, embedding);
      appendMemoryToMarkdown(
        config.storage_path,
        project.name,
        item.content,
        item.category,
        memory.importance,
        memory.tags,
      );
      imported++;
    } catch {
      failed++;
    }
  }

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          imported,
          failed,
          total: params.memories.length,
          project: project.name,
        }),
      },
    ],
  };
}
