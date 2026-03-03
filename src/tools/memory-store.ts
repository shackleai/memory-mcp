import { v4 as uuidv4 } from "uuid";
import { generateEmbedding } from "../engine/embeddings.js";
import { insertMemory, getProjectByPath } from "../engine/storage.js";
import { checkDuplicate, updateDuplicate } from "../engine/dedup.js";
import { appendMemoryToMarkdown } from "../engine/markdown.js";
import { getOrCreateProject } from "../engine/project.js";
import type { Config, Memory, MemoryCategory, Importance } from "../types/index.js";

interface MemoryStoreParams {
  content: string;
  category: MemoryCategory;
  importance?: Importance;
  tags?: string[];
}

export async function handleMemoryStore(params: MemoryStoreParams, config: Config) {
  // Determine current project from the most recently initialized project
  // In a real flow, memory_init is called first, setting the project context
  // For now, we use a simple approach
  const importance = params.importance || "medium";
  const tags = params.tags || [];

  const embedding = await generateEmbedding(params.content);

  // We need a project_id — use the last active project or a default
  // The MCP client typically calls memory_init first which sets up the project
  const projects = (await import("../engine/storage.js")).getAllProjects();
  if (projects.length === 0) {
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

  const project = projects[0]; // most recently active project

  // Check for duplicates
  const dedupResult = checkDuplicate(project.id, embedding, config);
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
  const memory: Memory = {
    id: uuidv4(),
    project_id: project.id,
    content: params.content,
    category: params.category,
    importance,
    tags,
    source: null,
    session_date: now.split("T")[0],
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
        }),
      },
    ],
  };
}
