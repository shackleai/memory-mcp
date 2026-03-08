import { v4 as uuidv4 } from "uuid";
import { generateEmbedding } from "../engine/embeddings.js";
import { insertMemory, getActiveOrMostRecentProject, getCurrentSessionId } from "../engine/storage.js";
import { checkDuplicate, updateDuplicate } from "../engine/dedup.js";
import { appendMemoryToMarkdown } from "../engine/markdown.js";
import { cloudMemoryStore } from "../engine/cloud.js";
import type { Config, Memory, MemoryCategory, Importance, TodoStatus } from "../types/index.js";

interface MemoryStoreParams {
  content: string;
  category: MemoryCategory;
  importance?: Importance;
  tags?: string[];
  status?: TodoStatus;
}

export async function handleMemoryStore(params: MemoryStoreParams, config: Config) {
  if (config.provider === "cloud") return cloudMemoryStore(params, config);
  const importance = params.importance || "medium";
  const tags = params.tags || [];

  // Use the active project set by memory_init, or fallback to most recent
  const project = getActiveOrMostRecentProject();
  if (!project) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            error: "No project initialized. Call memory_init first.",
          }),
        },
      ],
    };
  }

  const embedding = await generateEmbedding(params.content);

  // Check for duplicates (pass content for length ratio check)
  const dedupResult = checkDuplicate(project.id, embedding, config, params.content);
  if (dedupResult.isDuplicate && dedupResult.existingMemory) {
    updateDuplicate(dedupResult.existingMemory.id, params.content, embedding);
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            id: dedupResult.existingMemory.id,
            stored: true,
            deduplicated: true,
            message: "Updated existing similar memory",
          }),
        },
      ],
    };
  }

  const now = new Date().toISOString();
  const status = params.category === "todo" ? (params.status || "pending") : null;

  const memory: Memory = {
    id: uuidv4(),
    project_id: project.id,
    content: params.content,
    category: params.category,
    importance,
    tags,
    source: null,
    session_date: now.split("T")[0],
    session_id: getCurrentSessionId(),
    status,
    hit_count: 0,
    last_accessed_at: null,
    created_at: now,
    updated_at: now,
    is_active: 1,
  };

  insertMemory(memory, embedding);

  // Write to Markdown
  appendMemoryToMarkdown(
    config.storage_path,
    project.name,
    params.content,
    params.category,
    importance,
    tags,
  );

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          id: memory.id,
          stored: true,
          deduplicated: false,
          project: project.name,
          category: params.category,
          ...(status ? { status } : {}),
        }),
      },
    ],
  };
}
