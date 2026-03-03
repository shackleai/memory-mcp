import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { handleMemoryInit } from "./tools/memory-init.js";
import { handleMemoryStore } from "./tools/memory-store.js";
import { handleMemorySearch } from "./tools/memory-search.js";
import { handleMemoryUpdate } from "./tools/memory-update.js";
import { handleMemoryDelete } from "./tools/memory-delete.js";
import { handleMemoryList } from "./tools/memory-list.js";
import { handleSessionEnd } from "./tools/session-end.js";
import type { Config } from "./types/index.js";

export function registerTools(server: McpServer, config: Config) {
  server.tool(
    "memory_init",
    "Load project context and relevant memories for this session. Call this at the start of every session.",
    {
      project_path: z.string().describe("Current working directory of the project"),
      recent_messages: z
        .array(z.string())
        .optional()
        .describe("Recent conversation messages for context"),
    },
    async (params) => handleMemoryInit(params, config),
  );

  server.tool(
    "memory_store",
    "Save important information to persistent memory. Use for decisions, conventions, bugs, architecture choices, preferences, TODOs, and context.",
    {
      content: z.string().describe("What to remember"),
      category: z
        .enum([
          "decision",
          "convention",
          "bug",
          "architecture",
          "preference",
          "todo",
          "context",
          "session_summary",
        ])
        .describe("Category of the memory"),
      importance: z
        .enum(["low", "medium", "high"])
        .optional()
        .default("medium")
        .describe("How important is this memory"),
      tags: z.array(z.string()).optional().describe("Tags for organization"),
    },
    async (params) => handleMemoryStore(params, config),
  );

  server.tool(
    "memory_search",
    "Search past memories by semantic meaning. Returns the most relevant memories.",
    {
      query: z.string().describe("What to search for"),
      category: z.string().optional().describe("Filter by category"),
      limit: z
        .number()
        .min(1)
        .max(20)
        .optional()
        .default(5)
        .describe("Max results to return"),
    },
    async (params) => handleMemorySearch(params, config),
  );

  server.tool(
    "memory_update",
    "Update the content of an existing memory.",
    {
      id: z.string().describe("Memory ID to update"),
      content: z.string().describe("New content"),
      reason: z.string().optional().describe("Why the memory is being updated"),
    },
    async (params) => handleMemoryUpdate(params, config),
  );

  server.tool(
    "memory_delete",
    "Remove a memory (soft delete).",
    {
      id: z.string().describe("Memory ID to delete"),
    },
    async (params) => handleMemoryDelete(params, config),
  );

  server.tool(
    "memory_list_projects",
    "List all projects that have stored memories.",
    {},
    async () => handleMemoryList(config),
  );

  server.tool(
    "memory_session_end",
    "Save a session summary and any open items. Call this at the end of a session.",
    {
      summary: z.string().describe("Summary of what happened in this session"),
      open_items: z.array(z.string()).optional().describe("Tasks or questions left open"),
    },
    async (params) => handleSessionEnd(params, config),
  );
}
