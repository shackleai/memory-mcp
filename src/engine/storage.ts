import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { getDbPath } from "../utils/paths.js";
import { logger } from "../utils/logger.js";
import type { Config, Memory, MemoryWithScore, Project, Session } from "../types/index.js";

let db: Database.Database;

export function getDb(): Database.Database {
  return db;
}

export async function initStorage(config: Config): Promise<void> {
  const dbPath = getDbPath(config.storage_path);
  logger.info("Initializing storage at", dbPath);

  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  sqliteVec.load(db);
  logger.info("sqlite-vec loaded");

  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL UNIQUE,
      tech_stack TEXT,
      summary TEXT,
      conventions TEXT,
      created_at TEXT NOT NULL,
      last_session_at TEXT
    );

    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      importance TEXT DEFAULT 'medium',
      tags TEXT,
      source TEXT,
      session_date TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      is_active INTEGER DEFAULT 1,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
    CREATE INDEX IF NOT EXISTS idx_memories_category ON memories(project_id, category);

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      date TEXT NOT NULL,
      summary TEXT,
      open_items TEXT,
      memory_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE INDEX IF NOT EXISTS idx_sessions_project ON sessions(project_id, date DESC);

    CREATE VIRTUAL TABLE IF NOT EXISTS memory_embeddings USING vec0(
      id TEXT PRIMARY KEY,
      embedding float[384]
    );
  `);

  logger.info("Database schema initialized");
}

// --- Memory CRUD ---

export function insertMemory(memory: Memory, embedding: Float32Array): void {
  const insertMem = db.prepare(`
    INSERT INTO memories (id, project_id, content, category, importance, tags, source, session_date, created_at, updated_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
  `);

  const insertVec = db.prepare(`
    INSERT INTO memory_embeddings (id, embedding) VALUES (?, ?)
  `);

  const transaction = db.transaction(() => {
    insertMem.run(
      memory.id,
      memory.project_id,
      memory.content,
      memory.category,
      memory.importance,
      JSON.stringify(memory.tags),
      memory.source,
      memory.session_date,
      memory.created_at,
      memory.updated_at,
    );
    insertVec.run(memory.id, Buffer.from(embedding.buffer));
  });

  transaction();
}

export function getMemory(id: string): Memory | undefined {
  const row = db.prepare("SELECT * FROM memories WHERE id = ? AND is_active = 1").get(id) as
    | (Memory & { tags: string })
    | undefined;
  if (!row) return undefined;
  return { ...row, tags: JSON.parse(row.tags || "[]") };
}

export function updateMemory(id: string, content: string, embedding: Float32Array): void {
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    db.prepare("UPDATE memories SET content = ?, updated_at = ? WHERE id = ?").run(content, now, id);
    db.prepare("DELETE FROM memory_embeddings WHERE id = ?").run(id);
    db.prepare("INSERT INTO memory_embeddings (id, embedding) VALUES (?, ?)").run(
      id,
      Buffer.from(embedding.buffer),
    );
  });
  transaction();
}

export function deleteMemory(id: string): boolean {
  const result = db.prepare("UPDATE memories SET is_active = 0, updated_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    id,
  );
  if (result.changes > 0) {
    db.prepare("DELETE FROM memory_embeddings WHERE id = ?").run(id);
    return true;
  }
  return false;
}

export function searchMemories(
  projectId: string,
  embedding: Float32Array,
  limit: number,
  category?: string,
): MemoryWithScore[] {
  // KNN search via sqlite-vec, then join with memories table
  const vecResults = db
    .prepare(
      `
    SELECT id, distance
    FROM memory_embeddings
    WHERE embedding MATCH ?
    ORDER BY distance
    LIMIT ?
  `,
    )
    .all(Buffer.from(embedding.buffer), limit * 3) as Array<{ id: string; distance: number }>;

  if (vecResults.length === 0) return [];

  const ids = vecResults.map((r) => r.id);
  const distanceMap = new Map(vecResults.map((r) => [r.id, r.distance]));

  const placeholders = ids.map(() => "?").join(",");
  let query = `SELECT * FROM memories WHERE id IN (${placeholders}) AND project_id = ? AND is_active = 1`;
  const params: unknown[] = [...ids, projectId];

  if (category) {
    query += " AND category = ?";
    params.push(category);
  }

  const rows = db.prepare(query).all(...params) as Array<Memory & { tags: string }>;

  return rows
    .map((row) => ({
      ...row,
      tags: JSON.parse(row.tags || "[]"),
      score: 1 - (distanceMap.get(row.id) || 0), // convert distance to similarity
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

export function getMemoriesByProject(projectId: string, category?: string): Memory[] {
  let query = "SELECT * FROM memories WHERE project_id = ? AND is_active = 1";
  const params: unknown[] = [projectId];
  if (category) {
    query += " AND category = ?";
    params.push(category);
  }
  query += " ORDER BY updated_at DESC";
  const rows = db.prepare(query).all(...params) as Array<Memory & { tags: string }>;
  return rows.map((row) => ({ ...row, tags: JSON.parse(row.tags || "[]") }));
}

// --- Project CRUD ---

export function insertProject(project: Project): void {
  db.prepare(
    `INSERT INTO projects (id, name, path, tech_stack, summary, conventions, created_at, last_session_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    project.id,
    project.name,
    project.path,
    project.tech_stack,
    project.summary,
    project.conventions,
    project.created_at,
    project.last_session_at,
  );
}

export function getProjectByPath(path: string): Project | undefined {
  return db.prepare("SELECT * FROM projects WHERE path = ?").get(path) as Project | undefined;
}

export function getAllProjects(): Project[] {
  return db.prepare("SELECT * FROM projects ORDER BY last_session_at DESC").all() as Project[];
}

export function updateProjectSession(projectId: string): void {
  db.prepare("UPDATE projects SET last_session_at = ? WHERE id = ?").run(
    new Date().toISOString(),
    projectId,
  );
}

// --- Session CRUD ---

export function insertSession(session: Session): void {
  db.prepare(
    `INSERT INTO sessions (id, project_id, date, summary, open_items, memory_count, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    session.id,
    session.project_id,
    session.date,
    session.summary,
    session.open_items,
    session.memory_count,
    session.created_at,
  );
}

export function getProjectMemoryCount(projectId: string): number {
  const result = db
    .prepare("SELECT COUNT(*) as count FROM memories WHERE project_id = ? AND is_active = 1")
    .get(projectId) as { count: number };
  return result.count;
}
