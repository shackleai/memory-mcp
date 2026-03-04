import { getOrCreateProject } from "../engine/project.js";
import { getMemoriesByProject, updateProjectSession, getProjectMemoryCount } from "../engine/storage.js";
import { archiveOldSessions } from "../engine/archive.js";
import type { Config } from "../types/index.js";

interface MemoryInitParams {
  project_path: string;
  recent_messages?: string[];
}

export async function handleMemoryInit(params: MemoryInitParams, config: Config) {
  const project = getOrCreateProject(params.project_path);
  updateProjectSession(project.id);

  // Auto-archive old session files
  archiveOldSessions(config, project.name);

  const conventions = getMemoriesByProject(project.id, "convention").slice(0, 5);
  const decisions = getMemoriesByProject(project.id, "decision").slice(0, 5);
  const todos = getMemoriesByProject(project.id, "todo").slice(0, 5);
  const memoryCount = getProjectMemoryCount(project.id);

  const summary = [
    `Project: ${project.name}`,
    project.tech_stack ? `Tech stack: ${project.tech_stack}` : null,
    `Total memories: ${memoryCount}`,
    conventions.length > 0
      ? `\nConventions:\n${conventions.map((c) => `- ${c.content}`).join("\n")}`
      : null,
    decisions.length > 0
      ? `\nRecent decisions:\n${decisions.map((d) => `- ${d.content}`).join("\n")}`
      : null,
    todos.length > 0
      ? `\nOpen items:\n${todos.map((t) => `- ${t.content}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          project_name: project.name,
          project_id: project.id,
          tech_stack: project.tech_stack,
          memory_count: memoryCount,
          summary,
        }),
      },
    ],
  };
}
