import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { Config } from "../src/types/index.js";

// Use a temp directory so tests don't pollute the real ~/.shackleai/
let testDir: string;
let config: Config;

beforeAll(async () => {
  testDir = mkdtempSync(join(tmpdir(), "shackleai-test-"));
  config = {
    storage_path: testDir,
    embedding: { provider: "local" },
    max_memories_per_project: 10000,
    max_session_history_days: 90,
    auto_init: true,
    auto_dedup: true,
    dedup_threshold: 0.9,
  };
});

afterAll(() => {
  try {
    rmSync(testDir, { recursive: true, force: true });
  } catch {
    // ignore cleanup errors on Windows
  }
});

describe("storage layer", () => {
  it("should initialize SQLite + sqlite-vec database", async () => {
    const { initStorage, getDb } = await import("../src/engine/storage.js");
    await initStorage(config);
    const db = getDb();
    expect(db).toBeDefined();

    // Verify tables exist
    const tables = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all() as Array<{ name: string }>;
    const tableNames = tables.map((t) => t.name);
    expect(tableNames).toContain("memories");
    expect(tableNames).toContain("projects");
    expect(tableNames).toContain("sessions");
    expect(tableNames).toContain("memory_embeddings");
  });

  it("should insert and retrieve a project", async () => {
    const { insertProject, getProjectByPath } = await import("../src/engine/storage.js");

    insertProject({
      id: "test-proj-1",
      name: "test-project",
      path: "/tmp/test-project",
      tech_stack: "Node.js, TypeScript",
      summary: null,
      conventions: null,
      created_at: new Date().toISOString(),
      last_session_at: new Date().toISOString(),
    });

    const project = getProjectByPath("/tmp/test-project");
    expect(project).toBeDefined();
    expect(project!.name).toBe("test-project");
    expect(project!.tech_stack).toBe("Node.js, TypeScript");
  });

  it("should insert a memory with embedding and search for it", async () => {
    const { insertMemory, searchMemories } = await import("../src/engine/storage.js");

    // Create a fake 384-dim embedding
    const embedding = new Float32Array(384);
    for (let i = 0; i < 384; i++) {
      embedding[i] = Math.random() * 2 - 1;
    }

    // Normalize it
    let norm = 0;
    for (let i = 0; i < 384; i++) norm += embedding[i] * embedding[i];
    norm = Math.sqrt(norm);
    for (let i = 0; i < 384; i++) embedding[i] /= norm;

    const now = new Date().toISOString();
    insertMemory(
      {
        id: "mem-1",
        project_id: "test-proj-1",
        content: "We chose PostgreSQL as the database",
        category: "decision",
        importance: "high",
        tags: ["database", "architecture"],
        source: null,
        session_date: now.split("T")[0],
        created_at: now,
        updated_at: now,
        is_active: 1,
      },
      embedding,
    );

    // Search with a similar embedding (the same one should match perfectly)
    const results = searchMemories("test-proj-1", embedding, 5);
    expect(results.length).toBe(1);
    expect(results[0].content).toBe("We chose PostgreSQL as the database");
    expect(results[0].category).toBe("decision");
    expect(results[0].score).toBeGreaterThan(0.9);
  });

  it("should soft-delete a memory", async () => {
    const { deleteMemory, getMemory } = await import("../src/engine/storage.js");

    const deleted = deleteMemory("mem-1");
    expect(deleted).toBe(true);

    const memory = getMemory("mem-1");
    expect(memory).toBeUndefined(); // soft-deleted, not returned
  });
});

describe("embeddings", () => {
  it("should generate a 384-dim embedding from text", async () => {
    const { generateEmbedding } = await import("../src/engine/embeddings.js");

    const embedding = await generateEmbedding("We chose PostgreSQL as the database");
    expect(embedding).toBeInstanceOf(Float32Array);
    expect(embedding.length).toBe(384);

    // Should be normalized (magnitude ~1.0)
    let magnitude = 0;
    for (let i = 0; i < embedding.length; i++) {
      magnitude += embedding[i] * embedding[i];
    }
    magnitude = Math.sqrt(magnitude);
    expect(magnitude).toBeCloseTo(1.0, 1);
  }, 60000); // 60s timeout for first model download

  it("should produce similar embeddings for similar text", async () => {
    const { generateEmbedding, cosineSimilarity } = await import("../src/engine/embeddings.js");

    const emb1 = await generateEmbedding("We use PostgreSQL for the database");
    const emb2 = await generateEmbedding("Our database choice is PostgreSQL");
    const emb3 = await generateEmbedding("The weather is sunny today");

    const similarScore = cosineSimilarity(emb1, emb2);
    const differentScore = cosineSimilarity(emb1, emb3);

    // Similar texts should have high similarity
    expect(similarScore).toBeGreaterThan(0.7);
    // Different texts should have lower similarity
    expect(differentScore).toBeLessThan(similarScore);
  }, 30000);
});

describe("markdown", () => {
  it("should write and read a memory markdown file", async () => {
    const { appendMemoryToMarkdown, readMarkdownFile } = await import("../src/engine/markdown.js");
    const { join: pathJoin } = await import("node:path");

    appendMemoryToMarkdown(
      testDir,
      "test-project",
      "We chose PostgreSQL as the database",
      "decision",
      "high",
      ["database"],
    );

    const filePath = pathJoin(testDir, "projects", "test-project", "decisions.md");
    const content = readMarkdownFile(filePath);
    expect(content).toBeTruthy();
    expect(content).toContain("We chose PostgreSQL as the database");
    expect(content).toContain("(high)");
    expect(content).toContain("[database]");
  });

  it("should write a session markdown file", async () => {
    const { writeSessionMarkdown, readMarkdownFile } = await import("../src/engine/markdown.js");
    const { join: pathJoin } = await import("node:path");

    writeSessionMarkdown(testDir, "test-project", "2026-03-04", "Built the MCP server", [
      "Add more tests",
      "Test with Claude Code",
    ]);

    const filePath = pathJoin(testDir, "projects", "test-project", "sessions", "2026-03-04.md");
    const content = readMarkdownFile(filePath);
    expect(content).toBeTruthy();
    expect(content).toContain("Built the MCP server");
    expect(content).toContain("Add more tests");
  });
});
