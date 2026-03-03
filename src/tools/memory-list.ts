import { getAllProjects, getProjectMemoryCount } from "../engine/storage.js";
import type { Config } from "../types/index.js";

export async function handleMemoryList(config: Config) {
  const projects = getAllProjects();

  const result = projects.map((p) => ({
    name: p.name,
    path: p.path,
    tech_stack: p.tech_stack,
    memory_count: getProjectMemoryCount(p.id),
    last_session: p.last_session_at,
    created_at: p.created_at,
  }));

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ projects: result, count: result.length }),
      },
    ],
  };
}
