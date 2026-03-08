/**
 * Cloud storage engine — routes all memory operations to ShackleAI Platform REST API.
 * Used when config.provider === "cloud". Requires a valid API key (paid tier).
 *
 * REST API base: config.cloud_url (default: https://shackleai.com)
 * Auth: Bearer token via config.api_key
 */

import { logger } from "../utils/logger.js";
import type { Config } from "../types/index.js";

// Cloud session state (mirrors local storage.ts pattern)
let cloudProjectName: string | null = null;
let cloudSessionId: string | null = null;

export function setCloudProject(name: string): void {
  cloudProjectName = name;
}

export function getCloudProject(): string | null {
  return cloudProjectName;
}

export function setCloudSessionId(id: string): void {
  cloudSessionId = id;
}

export function getCloudSessionId(): string | null {
  return cloudSessionId;
}

interface CloudResponse {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
}

async function cloudRequest(
  config: Config,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  queryParams?: Record<string, string>,
): Promise<CloudResponse> {
  const baseUrl = config.cloud_url.replace(/\/+$/, "");
  let url = `${baseUrl}/api/memory${path}`;

  if (queryParams) {
    const params = new URLSearchParams(
      Object.entries(queryParams).filter(([, v]) => v !== "" && v !== undefined),
    );
    const qs = params.toString();
    if (qs) url += `?${qs}`;
  }

  logger.info(`Cloud ${method} ${url}`);

  const response = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${config.api_key}`,
      "Content-Type": "application/json",
      "User-Agent": "shackleai-memory-mcp/0.5.2",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const data = (await response.json()) as Record<string, unknown>;

  if (!response.ok) {
    logger.error(`Cloud API error ${response.status}:`, data);
  }

  return { ok: response.ok, status: response.status, data };
}

function mcpText(data: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }] };
}

function mcpError(message: string) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ error: message }) }],
    isError: true,
  };
}

// ── memory_init (cloud) ──────────────────────────────────────────────────────

export async function cloudMemoryInit(
  params: { project_path: string },
  config: Config,
) {
  const projectName = params.project_path
    .replace(/\\/g, "/")
    .split("/")
    .filter(Boolean)
    .pop() || "unknown";

  setCloudProject(projectName);

  // Generate a local session ID — the cloud will track it
  const sessionId = crypto.randomUUID();
  setCloudSessionId(sessionId);

  // Search for conventions and decisions to build init summary
  const [convRes, decRes, todoRes, projRes] = await Promise.all([
    cloudRequest(config, "GET", "/search", undefined, {
      query: "conventions and rules",
      project: projectName,
      category: "convention",
      limit: "5",
    }),
    cloudRequest(config, "GET", "/search", undefined, {
      query: "recent decisions",
      project: projectName,
      category: "decision",
      limit: "5",
    }),
    cloudRequest(config, "GET", "/status", undefined, {
      project: projectName,
      status: "pending",
    }),
    cloudRequest(config, "GET", "/projects"),
  ]);

  const conventions = (convRes.data.results as Array<{ content: string }>) || [];
  const decisions = (decRes.data.results as Array<{ content: string }>) || [];
  const todos = (todoRes.data.todos as Array<{ content: string; status: string }>) || [];
  const projects = (projRes.data.projects as Array<{ memory_count: number; name: string }>) || [];
  const memoryCount = projects.find((p) => p.name === projectName)?.memory_count || 0;

  const summary = [
    `Project: ${projectName}`,
    `Total memories: ${memoryCount}`,
    conventions.length > 0
      ? `\nConventions:\n${conventions.map((c) => `- ${c.content}`).join("\n")}`
      : null,
    decisions.length > 0
      ? `\nRecent decisions:\n${decisions.map((d) => `- ${d.content}`).join("\n")}`
      : null,
    todos.length > 0
      ? `\nOpen items:\n${todos.map((t) => `- [${t.status || "pending"}] ${t.content}`).join("\n")}`
      : null,
  ]
    .filter(Boolean)
    .join("\n");

  return mcpText({
    project_name: projectName,
    memory_count: memoryCount,
    session_id: sessionId,
    summary,
    _hint: "Connected to ShackleAI Cloud. All memories sync across devices.",
  });
}

// ── memory_store (cloud) ─────────────────────────────────────────────────────

export async function cloudMemoryStore(
  params: {
    content: string;
    category: string;
    importance?: string;
    tags?: string[];
    status?: string;
  },
  config: Config,
) {
  const project = getCloudProject();
  if (!project) return mcpError("No project initialized. Call memory_init first.");

  const res = await cloudRequest(config, "POST", "/store", {
    project,
    content: params.content,
    category: params.category,
    importance: params.importance || "medium",
    tags: params.tags || [],
    status: params.status,
    session_id: getCloudSessionId(),
  });

  if (!res.ok) return mcpError(String(res.data.error || `Cloud API error: ${res.status}`));

  return mcpText({
    id: res.data.id,
    stored: true,
    deduplicated: res.data.action === "updated",
    project,
    category: params.category,
  });
}

// ── memory_search (cloud) ────────────────────────────────────────────────────

export async function cloudMemorySearch(
  params: { query: string; category?: string; limit?: number },
  config: Config,
) {
  const project = getCloudProject();
  const queryParams: Record<string, string> = {
    query: params.query,
    limit: String(params.limit || 5),
  };
  if (project) queryParams.project = project;
  if (params.category) queryParams.category = params.category;

  const res = await cloudRequest(config, "GET", "/search", undefined, queryParams);
  if (!res.ok) return mcpError(String(res.data.error || `Cloud API error: ${res.status}`));

  const results = (res.data.results as Array<Record<string, unknown>>) || [];
  return mcpText({
    results: results.map((r) => ({
      id: r.id,
      content: r.content,
      category: r.category,
      importance: r.importance,
      tags: r.tags,
      ...(r.status ? { status: r.status } : {}),
      relevance: r.relevance,
      hit_count: r.hit_count || 0,
      created_at: r.created_at,
      updated_at: r.updated_at,
    })),
    count: results.length,
    project: project || "all",
    _hint: "If you discover new information during this session, call memory_store to save it.",
  });
}

// ── memory_update (cloud) ────────────────────────────────────────────────────

export async function cloudMemoryUpdate(
  params: { id: string; content: string; reason?: string },
  config: Config,
) {
  const res = await cloudRequest(config, "PUT", "/update", {
    id: params.id,
    content: params.content,
  });

  if (!res.ok) return mcpError(String(res.data.error || `Cloud API error: ${res.status}`));

  return mcpText({
    updated: true,
    id: params.id,
    new_content: params.content,
    reason: params.reason || null,
  });
}

// ── memory_delete (cloud) ────────────────────────────────────────────────────

export async function cloudMemoryDelete(
  params: { id: string },
  config: Config,
) {
  const res = await cloudRequest(config, "DELETE", "/delete", undefined, { id: params.id });
  if (!res.ok) return mcpError(String(res.data.error || `Cloud API error: ${res.status}`));

  return mcpText({ deleted: true, id: params.id });
}

// ── memory_list_projects (cloud) ─────────────────────────────────────────────

export async function cloudMemoryListProjects(config: Config) {
  const res = await cloudRequest(config, "GET", "/projects");
  if (!res.ok) return mcpError(String(res.data.error || `Cloud API error: ${res.status}`));

  const projects = (res.data.projects as Array<Record<string, unknown>>) || [];
  return mcpText({
    projects: projects.map((p) => ({
      name: p.name,
      memory_count: p.memory_count,
      open_todos: p.open_todos,
      created_at: p.created_at,
    })),
    count: projects.length,
  });
}

// ── memory_session_end (cloud) ───────────────────────────────────────────────

export async function cloudSessionEnd(
  params: { summary: string; open_items?: string[] },
  config: Config,
) {
  const project = getCloudProject();
  if (!project) return mcpError("No active project. Call memory_init first.");

  const sessionId = getCloudSessionId() || crypto.randomUUID();

  const res = await cloudRequest(config, "POST", "/session", {
    project,
    session_id: sessionId,
    summary: params.open_items?.length
      ? `${params.summary}\n\nOpen items:\n${params.open_items.map((i) => `- ${i}`).join("\n")}`
      : params.summary,
  });

  if (!res.ok) return mcpError(String(res.data.error || `Cloud API error: ${res.status}`));

  return mcpText({
    saved: true,
    session_id: sessionId,
    date: new Date().toISOString().split("T")[0],
    project,
    _hint: "Session saved. Next session, start with memory_search to reload context.",
  });
}

// ── memory_status (cloud) ────────────────────────────────────────────────────

export async function cloudMemoryStatus(
  params: { id?: string; status?: string; list_status?: string },
  config: Config,
) {
  // Update mode
  if (params.id && params.status) {
    const res = await cloudRequest(config, "POST", "/status", {
      id: params.id,
      status: params.status,
    });
    if (!res.ok) return mcpError(String(res.data.error || `Cloud API error: ${res.status}`));

    return mcpText({
      updated: true,
      id: params.id,
      new_status: params.status,
    });
  }

  // List mode
  const project = getCloudProject();
  const queryParams: Record<string, string> = {};
  if (project) queryParams.project = project;
  if (params.list_status) queryParams.status = params.list_status;

  const res = await cloudRequest(config, "GET", "/status", undefined, queryParams);
  if (!res.ok) return mcpError(String(res.data.error || `Cloud API error: ${res.status}`));

  return mcpText({
    todos: res.data.todos,
    count: res.data.count,
    project: project || "all",
  });
}

// ── memory_export (cloud) ────────────────────────────────────────────────────

export async function cloudMemoryExport(config: Config) {
  const project = getCloudProject();
  const queryParams: Record<string, string> = {};
  if (project) queryParams.project = project;

  const res = await cloudRequest(config, "GET", "/export", undefined, queryParams);
  if (!res.ok) return mcpError(String(res.data.error || `Cloud API error: ${res.status}`));

  return mcpText(res.data);
}

// ── memory_import (cloud) ────────────────────────────────────────────────────

export async function cloudMemoryImport(
  params: {
    memories: Array<{
      content: string;
      category: string;
      importance?: string;
      tags?: string[];
      status?: string;
      created_at?: string;
    }>;
  },
  config: Config,
) {
  const project = getCloudProject();
  if (!project) return mcpError("No active project. Call memory_init first.");

  const res = await cloudRequest(config, "POST", "/import", {
    project,
    memories: params.memories,
  });

  if (!res.ok) return mcpError(String(res.data.error || `Cloud API error: ${res.status}`));

  return mcpText({
    imported: res.data.imported,
    skipped: res.data.skipped,
    total: params.memories.length,
    project,
  });
}

// ── memory_cleanup (cloud) ───────────────────────────────────────────────────

export async function cloudMemoryCleanup(
  _params: {
    archive_done_todos?: boolean;
    delete_stale_days?: number;
    max_importance?: string;
  },
  config: Config,
) {
  const project = getCloudProject();
  const queryParams: Record<string, string> = {};
  if (project) queryParams.project = project;

  const res = await cloudRequest(config, "POST", "/cleanup", undefined, queryParams);
  if (!res.ok) return mcpError(String(res.data.error || `Cloud API error: ${res.status}`));

  return mcpText({
    project: project || "all",
    archived_done_todos: res.data.archived_todos,
    deleted_stale: res.data.deleted_stale,
    _hint:
      ((res.data.archived_todos as number) || 0) + ((res.data.deleted_stale as number) || 0) === 0
        ? "Memory store is clean — nothing to archive or delete."
        : `Cleaned up ${((res.data.archived_todos as number) || 0) + ((res.data.deleted_stale as number) || 0)} memories.`,
  });
}
