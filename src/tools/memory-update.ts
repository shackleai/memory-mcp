import { getMemory, updateMemory } from "../engine/storage.js";
import { generateEmbedding } from "../engine/embeddings.js";
import { cloudMemoryUpdate } from "../engine/cloud.js";
import type { Config } from "../types/index.js";

interface MemoryUpdateParams {
  id: string;
  content: string;
  reason?: string;
}

export async function handleMemoryUpdate(params: MemoryUpdateParams, config: Config) {
  if (config.provider === "cloud") return cloudMemoryUpdate(params, config);
  const existing = getMemory(params.id);
  if (!existing) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ updated: false, error: "Memory not found" }),
        },
      ],
    };
  }

  const embedding = await generateEmbedding(params.content);
  updateMemory(params.id, params.content, embedding);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          updated: true,
          id: params.id,
          previous_content: existing.content,
          new_content: params.content,
          reason: params.reason || null,
        }),
      },
    ],
  };
}
