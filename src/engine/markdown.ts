import { readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { getProjectDir, getSessionsDir } from "../utils/paths.js";
import { logger } from "../utils/logger.js";
import type { MemoryCategory } from "../types/index.js";

const CATEGORY_FILES: Record<MemoryCategory, string> = {
  decision: "decisions.md",
  convention: "conventions.md",
  bug: "bugs.md",
  architecture: "architecture.md",
  preference: "preferences.md",
  todo: "todos.md",
  context: "context.md",
  session_summary: "sessions.md",
};

export function appendMemoryToMarkdown(
  storagePath: string,
  projectName: string,
  content: string,
  category: MemoryCategory,
  importance: string,
  tags: string[],
): void {
  const projectDir = getProjectDir(storagePath, projectName);
  const fileName = CATEGORY_FILES[category];
  const filePath = join(projectDir, fileName);

  const timestamp = new Date().toISOString().split("T")[0];
  const tagStr = tags.length > 0 ? ` [${tags.join(", ")}]` : "";
  const entry = `\n### ${timestamp} (${importance})${tagStr}\n${content}\n`;

  if (!existsSync(filePath)) {
    const header = `# ${category.charAt(0).toUpperCase() + category.slice(1)}s\n`;
    writeFileSync(filePath, header, "utf-8");
  }

  appendFileSync(filePath, entry, "utf-8");
  logger.debug("Appended to", filePath);
}

export function writeSessionMarkdown(
  storagePath: string,
  projectName: string,
  date: string,
  summary: string,
  openItems?: string[],
): void {
  const sessionsDir = getSessionsDir(storagePath, projectName);
  const filePath = join(sessionsDir, `${date}.md`);

  let content = `# Session — ${date}\n\n## Summary\n${summary}\n`;

  if (openItems && openItems.length > 0) {
    content += `\n## Open Items\n`;
    for (const item of openItems) {
      content += `- ${item}\n`;
    }
  }

  writeFileSync(filePath, content, "utf-8");
  logger.debug("Session written to", filePath);
}

export function readMarkdownFile(filePath: string): string | null {
  if (!existsSync(filePath)) return null;
  return readFileSync(filePath, "utf-8");
}
