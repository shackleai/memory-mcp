import { v4 as uuidv4 } from "uuid";
import { getActiveOrMostRecentProject, insertSession, getProjectMemoryCount } from "../engine/storage.js";
import { writeSessionMarkdown } from "../engine/markdown.js";
import { cloudSessionEnd } from "../engine/cloud.js";
import type { Config } from "../types/index.js";

interface SessionEndParams {
  summary: string;
  open_items?: string[];
}

export async function handleSessionEnd(params: SessionEndParams, config: Config) {
  if (config.provider === "cloud") return cloudSessionEnd(params, config);
  const project = getActiveOrMostRecentProject();
  if (!project) {
    return {
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({ saved: false, error: "No active project" }),
        },
      ],
    };
  }

  const now = new Date();
  const date = now.toISOString().split("T")[0];

  const session = {
    id: uuidv4(),
    project_id: project.id,
    date,
    summary: params.summary,
    open_items: params.open_items ? JSON.stringify(params.open_items) : null,
    memory_count: getProjectMemoryCount(project.id),
    created_at: now.toISOString(),
  };

  insertSession(session);

  // Write session Markdown file
  writeSessionMarkdown(config.storage_path, project.name, date, params.summary, params.open_items);

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({
          saved: true,
          session_id: session.id,
          date,
          project: project.name,
          _hint: "Session saved. Next session, start with memory_search to reload context.",
        }),
      },
    ],
  };
}
