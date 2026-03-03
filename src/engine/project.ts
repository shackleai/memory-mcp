import { existsSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { v4 as uuidv4 } from "uuid";
import { getProjectByPath, insertProject } from "./storage.js";
import { logger } from "../utils/logger.js";
import type { Project } from "../types/index.js";

interface TechDetection {
  name: string;
  indicators: string[];
}

const TECH_DETECTIONS: TechDetection[] = [
  { name: "Node.js", indicators: ["package.json"] },
  { name: "TypeScript", indicators: ["tsconfig.json"] },
  { name: "Python", indicators: ["pyproject.toml", "requirements.txt", "setup.py"] },
  { name: "Rust", indicators: ["Cargo.toml"] },
  { name: "Go", indicators: ["go.mod"] },
  { name: "Java", indicators: ["pom.xml", "build.gradle"] },
  { name: "Ruby", indicators: ["Gemfile"] },
  { name: "PHP", indicators: ["composer.json"] },
  { name: ".NET", indicators: ["*.csproj", "*.sln"] },
  { name: "Next.js", indicators: ["next.config.js", "next.config.mjs", "next.config.ts"] },
  { name: "React", indicators: ["src/App.tsx", "src/App.jsx"] },
  { name: "Vue", indicators: ["vue.config.js", "nuxt.config.ts"] },
  { name: "Docker", indicators: ["Dockerfile", "docker-compose.yml"] },
];

function detectTechStack(projectPath: string): string[] {
  const detected: string[] = [];

  for (const tech of TECH_DETECTIONS) {
    for (const indicator of tech.indicators) {
      if (existsSync(join(projectPath, indicator))) {
        detected.push(tech.name);
        break;
      }
    }
  }

  return detected;
}

function deriveProjectName(projectPath: string): string {
  // Try package.json name first
  const pkgPath = join(projectPath, "package.json");
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.name) return pkg.name.replace(/^@[^/]+\//, ""); // strip scope
    } catch {
      // fall through
    }
  }

  // Try pyproject.toml name
  const pyprojectPath = join(projectPath, "pyproject.toml");
  if (existsSync(pyprojectPath)) {
    try {
      const content = readFileSync(pyprojectPath, "utf-8");
      const match = content.match(/^name\s*=\s*"([^"]+)"/m);
      if (match) return match[1];
    } catch {
      // fall through
    }
  }

  // Fallback to directory name
  return basename(projectPath);
}

export function getOrCreateProject(projectPath: string): Project {
  // Normalize path separators for consistent lookups (Windows \ vs Unix /)
  const normalizedPath = projectPath.replace(/\\/g, "/");

  const existing = getProjectByPath(normalizedPath);
  if (existing) {
    logger.debug("Found existing project:", existing.name);
    return existing;
  }

  const name = deriveProjectName(projectPath);
  const techStack = detectTechStack(projectPath);

  const project: Project = {
    id: uuidv4(),
    name,
    path: normalizedPath,
    tech_stack: techStack.length > 0 ? techStack.join(", ") : null,
    summary: null,
    conventions: null,
    created_at: new Date().toISOString(),
    last_session_at: new Date().toISOString(),
  };

  insertProject(project);
  logger.info("Created new project:", name, techStack.length > 0 ? `(${techStack.join(", ")})` : "");
  return project;
}
