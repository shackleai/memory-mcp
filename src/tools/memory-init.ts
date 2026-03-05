import { v4 as uuidv4 } from "uuid";
import { getOrCreateProject } from "../engine/project.js";
import {
  getMemoriesByProject,
  updateProjectSession,
  getProjectMemoryCount,
  setActiveProject,
  setCurrentSessionId,
  getTodosByStatus,
} from "../engine/storage.js";
import { archiveOldSessions } from "../engine/archive.js";
import { getUsageNudge } from "../engine/nudge.js";
import type { Config } from "../types/index.js";

interface MemoryInitParams {
  project_path: string;
  recent_messages?: string[];
}

export async function handleMemoryInit(params: MemoryInitParams, config: Config) {
  const project = getOrCreateProject(params.project_path);

  // Set as the active project for this session — all subsequent tool calls use this
  setActiveProject(project.id);
  updateProjectSession(project.id);

  // Generate session ID for traceability — all memories stored in this session get linked
  const sessionId = uuidv4();
  setCurrentSessionId(sessionId);

  // Auto-archive old session files
  archiveOldSessions(config, project.name);

  const conventions = getMemoriesByProject(project.id, "convention").slice(0, 5);
  const decisions = getMemoriesByProject(project.id, "decision").slice(0, 5);
  const memoryCount = getProjectMemoryCount(project.id);

  // Only show pending and in_progress TODOs (not done ones)
  const pendingTodos = getTodosByStatus(project.id, "pending");
  const inProgressTodos = getTodosByStatus(project.id, "in_progress");
  const openTodos = [...inProgressTodos, ...pendingTodos].slice(0, 10);

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
    openTodos.length > 0
      ? `\nOpen items:\n${openTodos.map((t) => `- [${t.status || "pending"}] ${t.content}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  // Check for usage-based nudge (non-annoying: max once/day, only after 3+ sessions)
  const nudge = getUsageNudge(memoryCount);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          project_name: project.name,
          project_id: project.id,
          tech_stack: project.tech_stack,
          memory_count: memoryCount,
          session_id: sessionId,
          summary,
          _hint: "Remember: call memory_store whenever you make decisions, discover bugs, or learn conventions during this session.",
          ...(nudge ? { _upgrade: nudge } : {}),
        }),
      },
    ],
  };
}
