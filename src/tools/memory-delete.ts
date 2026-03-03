import { deleteMemory } from "../engine/storage.js";
import type { Config } from "../types/index.js";

interface MemoryDeleteParams {
  id: string;
}

export async function handleMemoryDelete(params: MemoryDeleteParams, _config: Config) {
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
