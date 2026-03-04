import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { getDb, insertMemory, insertProject, getProjectByPath } from "./storage.js";
import { generateEmbedding } from "./embeddings.js";
import { logger } from "../utils/logger.js";
import type { Config, MemoryCategory } from "../types/index.js";

const FILE_TO_CATEGORY: Record<string, MemoryCategory> = {
  "decisions.md": "decision",
  "conventions.md": "convention",
  "bugs.md": "bug",
  "architecture.md": "architecture",
  "preferences.md": "preference",
  "todos.md": "todo",
  "context.md": "context",
  "sessions.md": "session_summary",
};

interface ParsedEntry {
  date: string;
  importance: string;
  tags: string[];
  content: string;
}

function parseMarkdownEntries(content: string): ParsedEntry[] {
  const entries: ParsedEntry[] = [];
  const lines = content.split("\n");
  let current: ParsedEntry | null = null;
  const contentLines: string[] = [];

  for (const line of lines) {
    // Match entry headers like: ### 2026-03-04 (high) [tag1, tag2]
    const headerMatch = line.match(
      /^###\s+(\d{4}-\d{2}-\d{2})\s+\((\w+)\)\s*(?:\[([^\]]*)\])?/,
    );

    if (headerMatch) {
      // Save previous entry
      if (current) {
        current.content = contentLines.join("\n").trim();
        if (current.content) entries.push(current);
        contentLines.length = 0;
      }

      current = {
        date: headerMatch[1],
        importance: headerMatch[2],
        tags: headerMatch[3] ? headerMatch[3].split(",").map((t) => t.trim()) : [],
        content: "",
      };
    } else if (current && !line.startsWith("# ")) {
      contentLines.push(line);
    }
  }

  // Don't forget the last entry
  if (current) {
    current.content = contentLines.join("\n").trim();
    if (current.content) entries.push(current);
  }

  return entries;
}

/**
 * Rebuild SQLite database from Markdown files.
 * Use this when the database is corrupted or needs to be recreated.
 */
export async function rebuildFromMarkdown(config: Config): Promise<{
  projects: number;
  memories: number;
}> {
  const projectsDir = join(config.storage_path, "projects");
  if (!existsSync(projectsDir)) {
    logger.warn("No projects directory found at", projectsDir);
    return { projects: 0, memories: 0 };
  }

  const db = getDb();
  let totalProjects = 0;
  let totalMemories = 0;

  const projectDirs = readdirSync(projectsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  for (const projectName of projectDirs) {
    const projectDir = join(projectsDir, projectName);

    // Create or find project
    let project = getProjectByPath(projectDir);
    if (!project) {
      project = {
        id: uuidv4(),
        name: projectName,
        path: projectDir,
        tech_stack: null,
        summary: null,
        conventions: null,
        created_at: new Date().toISOString(),
        last_session_at: new Date().toISOString(),
      };
      insertProject(project);
      totalProjects++;
    }

    // Process each category file
    for (const [fileName, category] of Object.entries(FILE_TO_CATEGORY)) {
      const filePath = join(projectDir, fileName);
      if (!existsSync(filePath)) continue;

      const content = readFileSync(filePath, "utf-8");
      const entries = parseMarkdownEntries(content);

      for (const entry of entries) {
        // Check if this memory already exists (avoid duplicates on rebuild)
        const existing = db
          .prepare(
            "SELECT id FROM memories WHERE project_id = ? AND content = ? AND is_active = 1",
          )
          .get(project.id, entry.content) as { id: string } | undefined;

        if (existing) continue;

        const embedding = await generateEmbedding(entry.content);
        const now = new Date().toISOString();

        insertMemory(
          {
            id: uuidv4(),
            project_id: project.id,
            content: entry.content,
            category,
            importance: entry.importance as "low" | "medium" | "high",
            tags: entry.tags,
            source: "rebuild",
            session_date: entry.date,
            created_at: now,
            updated_at: now,
            is_active: 1,
          },
          embedding,
        );
        totalMemories++;
      }
    }

    logger.info(`Rebuilt project: ${projectName}`);
  }

  logger.info(`Rebuild complete: ${totalProjects} projects, ${totalMemories} memories`);
  return { projects: totalProjects, memories: totalMemories };
}
