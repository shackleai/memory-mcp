# ShackleAI Memory

**Persistent memory for AI coding tools.** The first MCP-native memory server.

Give Claude Code, Cursor, Windsurf, VS Code Copilot, OpenAI Codex, or any MCP-compatible AI tool persistent memory across sessions. Your AI remembers decisions, conventions, bugs, and context — picks up exactly where you left off.

[![npm version](https://img.shields.io/npm/v/@shackleai/memory-mcp.svg)](https://www.npmjs.com/package/@shackleai/memory-mcp)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Quick Start

Add to your MCP config. That's it.

### Claude Code

```bash
claude mcp add memory -- npx -y @shackleai/memory-mcp
```

Or manually edit `~/.claude/mcp.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@shackleai/memory-mcp"]
    }
  }
}
```

### Cursor

Add to `~/.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@shackleai/memory-mcp"]
    }
  }
}
```

### Windsurf

Add to `~/.codeium/windsurf/mcp_config.json`:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@shackleai/memory-mcp"]
    }
  }
}
```

### VS Code Copilot

Add to `.vscode/mcp.json` in your project:

```json
{
  "servers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@shackleai/memory-mcp"]
    }
  }
}
```

### Claude Desktop

Add to your Claude Desktop config:

- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@shackleai/memory-mcp"]
    }
  }
}
```

> **Windows note**: If you get "Cannot connect to MCP server" errors, use the full path:
> `"command": "C:\\Program Files\\nodejs\\npx.cmd"`

### First Run

The first run downloads the embedding model (~80MB, one-time). After that, everything works offline.

## How It Works

```
Session starts     → AI calls memory_init     → loads relevant past context
During session     → AI calls memory_store    → saves decisions, conventions, bugs
You ask a question → AI calls memory_search   → finds relevant past memories
Session ends       → AI calls memory_session_end → persists session summary
Next session       → AI picks up exactly where you left off
```

Your AI automatically uses these tools — no manual intervention needed. Just start coding.

## Features

- **7 MCP tools** — init, store, search, update, delete, list projects, session end
- **Local-first** — everything stored on your machine at `~/.shackleai/`
- **Zero config** — no API keys, no cloud account, no setup
- **Offline** — local embeddings via MiniLM-L6-v2 (free, runs on CPU)
- **Human-readable** — memories stored as Markdown files you can read and edit
- **Git-friendly** — version control your AI's memory with standard git
- **Semantic search** — find relevant memories by meaning, not just keywords
- **Deduplication** — automatically detects and merges duplicate memories
- **Auto-archive** — old session files cleaned up based on retention period
- **Multi-project** — separate memory spaces per project, auto-detected
- **LLM-portable** — switch AI tools anytime, your memory stays

## MCP Tools Reference

### memory_init

Called at session start. Loads project context and relevant memories.

```
Input:  { project_path: "/path/to/project" }
Output: { project_name, tech_stack, memory_count, summary }
```

Auto-detects project name from `package.json`, `pyproject.toml`, or directory name. Detects tech stack (Node.js, Python, Rust, Go, Java, Ruby, PHP, .NET, Docker, etc.).

### memory_store

Save important information to persistent memory.

```
Input:  {
  content: "We chose PostgreSQL with Prisma ORM",
  category: "decision",        // decision|convention|bug|architecture|preference|todo|context|session_summary
  importance: "high",           // low|medium|high (optional, default: medium)
  tags: ["database", "orm"]     // optional
}
Output: { id, stored: true, deduplicated: false }
```

Automatically checks for duplicates. If similar content exists (cosine similarity > 0.9), updates the existing memory instead of creating a new one.

### memory_search

Search past memories by semantic meaning.

```
Input:  { query: "what database are we using", limit: 5 }
Output: { results: [{ id, content, category, relevance, ... }], count }
```

Uses vector similarity search — finds relevant memories even when wording differs.

### memory_update

Update the content of an existing memory.

```
Input:  { id: "mem-uuid", content: "Updated content", reason: "Changed approach" }
Output: { updated: true, previous_content }
```

### memory_delete

Remove a memory (soft delete).

```
Input:  { id: "mem-uuid" }
Output: { deleted: true }
```

### memory_list_projects

List all projects with stored memories.

```
Input:  {}
Output: { projects: [{ name, path, tech_stack, memory_count, last_session }], count }
```

### memory_session_end

Save a session summary and open items.

```
Input:  { summary: "Built auth system", open_items: ["Add tests", "Deploy"] }
Output: { saved: true, date: "2026-03-04" }
```

## Storage

All data lives locally on your machine:

```
~/.shackleai/
  db/
    memory.db                    SQLite database + vector index
  projects/
    my-project/
      decisions.md               Key decisions with reasoning
      conventions.md             Coding standards and patterns
      bugs.md                    Known issues and fixes
      architecture.md            Architecture choices
      preferences.md             Developer preferences
      todos.md                   Open items
      context.md                 General context
      sessions/
        2026-03-04.md            Today's session summary
        2026-03-03.md            Yesterday's session
  config.yaml                    Optional configuration
```

**Markdown is the source of truth.** You can read, edit, or delete any memory file with a text editor. The SQLite database is the search index — if it gets corrupted, it can be rebuilt from Markdown files.

## Configuration

Create `~/.shackleai/config.yaml` (optional — sensible defaults work out of the box):

```yaml
# Embedding provider: "local" (free, offline) or "openai" (better quality, requires API key)
embedding:
  provider: local

# Custom storage path (default: ~/.shackleai)
# storage_path: /path/to/custom/location

# Maximum memories per project before oldest are archived
max_memories_per_project: 10000

# Session files older than this are auto-archived
max_session_history_days: 90

# Automatically detect and merge duplicate memories
auto_dedup: true

# Cosine similarity threshold for deduplication (0.0 to 1.0)
dedup_threshold: 0.9
```

## Why ShackleAI?

Every AI coding tool today has amnesia. Close the session, context is gone. Switch tools, everything lost.

ShackleAI fixes this by providing a **universal memory layer** that works across every MCP-compatible AI tool:

- **Works with every AI tool** — Claude Code, Cursor, Windsurf, VS Code Copilot, OpenAI Codex, Claude Desktop
- **Works with every LLM** — Claude, GPT, Gemini, Llama, Mistral — any LLM behind any MCP client
- **Your memory is YOUR asset** — switch tools anytime, your knowledge stays
- **No vendor lock-in** — open source, local storage, standard protocol

## Requirements

- Node.js 20 or later
- Any MCP-compatible AI client

## Contributing

Issues and PRs welcome at [github.com/shackleai/memory-mcp](https://github.com/shackleai/memory-mcp).

## License

MIT — free and open source forever.

---

*The shackle that keeps your AI anchored.* Built by [ShackleAI](https://shackleai.com).
