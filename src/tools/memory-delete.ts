import { deleteMemory } from "../engine/storage.js";
import { cloudMemoryDelete } from "../engine/cloud.js";
import type { Config } from "../types/index.js";

interface MemoryDeleteParams {
  id: string;
}

export async function handleMemoryDelete(params: MemoryDeleteParams, _config: Config) {
  if (_config.provider === "cloud") return cloudMemoryDelete(params, _config);
  const deleted = deleteMemory(params.id);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ deleted, id: params.id }),
      },
    ],
  };
}
