import { generateEmbedding } from "../engine/embeddings.js";
import { searchMemories, getAllProjects } from "../engine/storage.js";
import type { Config } from "../types/index.js";

interface MemorySearchParams {
  query: string;
  category?: string;
  limit?: number;
}

export async function handleMemorySearch(params: MemorySearchParams, config: Config) {
  const limit = params.limit || 5;

  const projects = getAllProjects();
  if (projects.length === 0) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ results: [], message: "No projects found. Call memory_init first." }),
        },
      ],
    };
  }

  const project = projects[0]; // most recently active
  const embedding = await generateEmbedding(params.query);
  const results = searchMemories(project.id, embedding, limit, params.category);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          results: results.map((r) => ({
            id: r.id,
            content: r.content,
            category: r.category,
            importance: r.importance,
            tags: r.tags,
            relevance: Math.round(r.score * 1000) / 1000,
            created_at: r.created_at,
            updated_at: r.updated_at,
          })),
          count: results.length,
          project: project.name,
        }),
      },
    ],
  };
}
