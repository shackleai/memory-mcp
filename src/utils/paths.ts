import { join } from "node:path";
import { homedir } from "node:os";
import { mkdirSync } from "node:fs";

export function getStoragePath(customPath?: string): string {
  const base = customPath || join(homedir(), ".shackleai");
  return base;
}

export function getDbPath(storagePath: string): string {
  const dbDir = join(storagePath, "db");
  mkdirSync(dbDir, { recursive: true });
  return join(dbDir, "memory.db");
}

export function getProjectDir(storagePath: string, projectName: string): string {
  const dir = join(storagePath, "projects", projectName);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getSessionsDir(storagePath: string, projectName: string): string {
  const dir = join(storagePath, "projects", projectName, "sessions");
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function getConfigPath(storagePath: string): string {
  return join(storagePath, "config.yaml");
}
