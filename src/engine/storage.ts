import Database from "better-sqlite3";
import * as sqliteVec from "sqlite-vec";
import { getDbPath } from "../utils/paths.js";
import { logger } from "../utils/logger.js";
import type { Config, Memory, MemoryWithScore, Project, Session, TodoStatus } from "../types/index.js";

let db: Database.Database;

// Active project set by memory_init, used by all other tools
let activeProjectId: string | null = null;

export function getDb(): Database.Database {
  return db;
}

export function setActiveProject(projectId: string): void {
  activeProjectId = projectId;
}

export function getActiveProject(): Project | null {
  if (!activeProjectId) return null;
  return (db.prepare("SELECT * FROM projects WHERE id = ?").get(activeProjectId) as Project) || null;
}

export function getActiveOrMostRecentProject(): Project | null {
  if (activeProjectId) {
    const project = db.prepare("SELECT * FROM projects WHERE id = ?").get(activeProjectId) as
      | Project
      | undefined;
    if (project) return project;
  }
  // Fallback to most recently active
  return (
    (db.prepare("SELECT * FROM projects ORDER BY last_session_at DESC LIMIT 1").get() as
      | Project
      | undefined) || null
  );
}

let dbClosed = false;

export function closeDb(): void {
  if (db && !dbClosed) {
    dbClosed = true;
    try {
      db.close();
      logger.info("Database closed cleanly");
    } catch (err) {
      logger.error("Error closing database:", err);
    }
  }
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

  // v0.4.0 schema migrations — add new columns if they don't exist
  const columns = db
    .prepare("PRAGMA table_info(memories)")
    .all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((c) => c.name));

  if (!columnNames.has("session_id")) {
    db.exec("ALTER TABLE memories ADD COLUMN session_id TEXT");
    logger.info("Migration: added session_id column");
  }
  if (!columnNames.has("status")) {
    db.exec("ALTER TABLE memories ADD COLUMN status TEXT");
    logger.info("Migration: added status column");
  }
  if (!columnNames.has("hit_count")) {
    db.exec("ALTER TABLE memories ADD COLUMN hit_count INTEGER DEFAULT 0");
    logger.info("Migration: added hit_count column");
  }
  if (!columnNames.has("last_accessed_at")) {
    db.exec("ALTER TABLE memories ADD COLUMN last_accessed_at TEXT");
    logger.info("Migration: added last_accessed_at column");
  }

  logger.info("Database schema initialized");
}

// --- Session ID tracking ---
let currentSessionId: string | null = null;

export function setCurrentSessionId(sessionId: string): void {
  currentSessionId = sessionId;
}

export function getCurrentSessionId(): string | null {
  return currentSessionId;
}

// --- Memory CRUD ---

export function insertMemory(memory: Memory, embedding: Float32Array): void {
  const insertMem = db.prepare(`
    INSERT INTO memories (id, project_id, content, category, importance, tags, source, session_date, session_id, status, hit_count, last_accessed_at, created_at, updated_at, is_active)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
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
      memory.session_id,
      memory.status,
      memory.hit_count || 0,
      memory.last_accessed_at,
      memory.created_at,
      memory.updated_at,
    );
    insertVec.run(memory.id, Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength));
  });

  transaction();
}

export function getMemory(id: string): Memory | undefined {
  const row = db.prepare("SELECT * FROM memories WHERE id = ? AND is_active = 1").get(id) as
    | (Memory & { tags: string })
    | undefined;
  if (!row) return undefined;
  try {
    return { ...row, tags: JSON.parse(row.tags || "[]") };
  } catch {
    return { ...row, tags: [] };
  }
}

export function updateMemory(id: string, content: string, embedding: Float32Array): void {
  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    db.prepare("UPDATE memories SET content = ?, updated_at = ? WHERE id = ?").run(content, now, id);
    db.prepare("DELETE FROM memory_embeddings WHERE id = ?").run(id);
    db.prepare("INSERT INTO memory_embeddings (id, embedding) VALUES (?, ?)").run(
      id,
      Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength),
    );
  });
  transaction();
}

export function deleteMemory(id: string): boolean {
  const transaction = db.transaction(() => {
    const result = db
      .prepare("UPDATE memories SET is_active = 0, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), id);
    if (result.changes > 0) {
      db.prepare("DELETE FROM memory_embeddings WHERE id = ?").run(id);
      return true;
    }
    return false;
  });
  return transaction();
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
    .all(Buffer.from(embedding.buffer, embedding.byteOffset, embedding.byteLength), limit * 3) as Array<{
    id: string;
    distance: number;
  }>;

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

  const results = rows
    .map((row) => ({
      ...row,
      tags: safeParseTags(row.tags),
      // sqlite-vec returns L2 distance. For normalized vectors: distance = 2 - 2*cosine_sim
      // So cosine_similarity = 1 - distance/2
      score: 1 - (distanceMap.get(row.id) || 0) / 2,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  // Update hit counts and last_accessed_at for returned results
  if (results.length > 0) {
    const now = new Date().toISOString();
    const updateHit = db.prepare(
      "UPDATE memories SET hit_count = COALESCE(hit_count, 0) + 1, last_accessed_at = ? WHERE id = ?",
    );
    for (const r of results) {
      updateHit.run(now, r.id);
    }
  }

  return results;
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
  return rows.map((row) => ({ ...row, tags: safeParseTags(row.tags) }));
}

function safeParseTags(tags: string | null | undefined): string[] {
  if (!tags) return [];
  try {
    return JSON.parse(tags);
  } catch {
    return [];
  }
}

// --- Project CRUD ---

export function insertProject(project: Project): void {
  db.prepare(
    `INSERT OR IGNORE INTO projects (id, name, path, tech_stack, summary, conventions, created_at, last_session_at)
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
  const normalizedPath = path.replace(/\\/g, "/");
  return db.prepare("SELECT * FROM projects WHERE path = ?").get(normalizedPath) as
    | Project
    | undefined;
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

// --- TODO Status ---

export function updateMemoryStatus(id: string, status: TodoStatus): boolean {
  const result = db
    .prepare("UPDATE memories SET status = ?, updated_at = ? WHERE id = ? AND is_active = 1")
    .run(status, new Date().toISOString(), id);
  return result.changes > 0;
}

export function getTodosByStatus(projectId: string, status?: TodoStatus): Memory[] {
  let query = "SELECT * FROM memories WHERE project_id = ? AND category = 'todo' AND is_active = 1";
  const params: unknown[] = [projectId];
  if (status) {
    query += " AND status = ?";
    params.push(status);
  }
  query += " ORDER BY importance DESC, updated_at DESC";
  const rows = db.prepare(query).all(...params) as Array<Memory & { tags: string }>;
  return rows.map((row) => ({ ...row, tags: safeParseTags(row.tags) }));
}

// --- Export/Import ---

export function exportProjectMemories(projectId: string): Memory[] {
  const rows = db
    .prepare("SELECT * FROM memories WHERE project_id = ? AND is_active = 1 ORDER BY created_at ASC")
    .all(projectId) as Array<Memory & { tags: string }>;
  return rows.map((row) => ({ ...row, tags: safeParseTags(row.tags) }));
}

// --- Cleanup ---

export function archiveDoneTodos(projectId: string): number {
  const result = db
    .prepare(
      "UPDATE memories SET is_active = 0, updated_at = ? WHERE project_id = ? AND category = 'todo' AND status = 'done' AND is_active = 1",
    )
    .run(new Date().toISOString(), projectId);
  // Also remove their embeddings
  if (result.changes > 0) {
    db.exec(`
      DELETE FROM memory_embeddings WHERE id IN (
        SELECT id FROM memories WHERE project_id = '${projectId}' AND category = 'todo' AND status = 'done' AND is_active = 0
      )
    `);
  }
  return result.changes;
}

export function deleteStaleMemories(projectId: string, olderThanDays: number, maxImportance: string): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - olderThanDays);
  const cutoffStr = cutoff.toISOString();

  const importanceFilter = maxImportance === "low" ? "('low')" : "('low', 'medium')";

  const result = db
    .prepare(
      `UPDATE memories SET is_active = 0, updated_at = ? WHERE project_id = ? AND is_active = 1 AND importance IN ${importanceFilter} AND updated_at < ? AND hit_count <= 1`,
    )
    .run(new Date().toISOString(), projectId, cutoffStr);

  if (result.changes > 0) {
    db.exec(`DELETE FROM memory_embeddings WHERE id NOT IN (SELECT id FROM memories WHERE is_active = 1)`);
  }
  return result.changes;
}
