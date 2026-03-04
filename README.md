# ShackleAI Memory

**Persistent memory for AI coding tools.** The first MCP-native memory server.

Give Claude Code, Cursor, Windsurf, VS Code Copilot, OpenAI Codex, or any MCP-compatible AI tool persistent memory across sessions. Your AI remembers decisions, conventions, bugs, and context — picks up exactly where you left off.

[![npm version](https://img.shields.io/npm/v/@shackleai/memory-mcp.svg)](https://www.npmjs.com/package/@shackleai/memory-mcp)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## Install — One Command

### Claude Code

```bash
claude mcp add memory -- npx -y @shackleai/memory-mcp
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

### Alternative: Install Globally

If `npx` doesn't work (older npm versions), install globally:

```bash
npm install -g @shackleai/memory-mcp
```

Then use the global binary in your MCP config:

```json
{
  "mcpServers": {
    "memory": {
      "command": "shackleai-memory"
    }
  }
}
```

### Alternative: Run from Source

Clone and run directly (for contributors or if npm isn't available):

```bash
git clone https://github.com/shackleai/memory-mcp.git
cd memory-mcp && npm install && npm run build
```

```json
{
  "mcpServers": {
    "memory": {
      "command": "node",
      "args": ["/absolute/path/to/memory-mcp/dist/index.js"]
    }
  }
}
```

### First Run

The first run downloads the embedding model (~80MB, one-time). After that, everything works offline.

## How It Works — Zero Config, Fully Automatic

```
1. You add one line to your MCP config (above)
2. Start your AI tool in any project directory
3. Memory server auto-detects your project on startup
4. AI stores decisions, conventions, and bugs as you work
5. Next session — AI picks up exactly where you left off
```

**You don't need to do anything.** The server auto-initializes from your working directory. The AI agent sees the memory tools and uses them proactively — storing important decisions, searching for past context, and saving session summaries.

### Supercharge It with CLAUDE.md (Recommended)

For even better results, add this to your project's `CLAUDE.md` file:

```markdown
## Memory

This project uses ShackleAI Memory for persistent context across sessions.
- At session start, search memory for relevant context about what you're working on
- When you make important decisions, discover bugs, or establish conventions — store them in memory
- Before ending a session, save a summary of what was accomplished and what's left to do
```

This tells your AI to proactively use memory. Without it, the tools still work, but the AI may not use them as aggressively.

## Features

- **Fully automatic** — auto-detects project on startup, no manual init needed
- **7 MCP tools** — init, store, search, update, delete, list projects, session end
- **MCP resources** — project context available as a readable resource
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

Initialize or switch project context. **Auto-called on server startup** — only call manually if switching projects mid-session.

```
Input:  { project_path: "/path/to/project" }
Output: { project_name, tech_stack, memory_count, summary }
```

Auto-detects project name from `package.json`, `pyproject.toml`, or directory name. Detects tech stack (Node.js, Python, Rust, Go, Java, Ruby, PHP, .NET, Docker, etc.).

### memory_store

Save important information to persistent memory. Use for decisions, conventions, bugs, architecture, preferences, TODOs, and context.

```
Input:  {
  content: "We chose PostgreSQL with Prisma ORM for type-safe queries",
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
Input:  { query: "what database are we using", category: "decision", limit: 5 }
Output: { results: [{ id, content, category, relevance, ... }], count }
```

Uses vector similarity search — finds relevant memories even when wording differs.

### memory_update

Update an existing memory when information changes.

```
Input:  { id: "mem-uuid", content: "Updated content", reason: "Changed approach" }
Output: { updated: true, previous_content }
```

### memory_delete

Remove a memory that is no longer relevant (soft delete).

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

Save a session summary and open items. Creates continuity between sessions.

```
Input:  { summary: "Built auth system with JWT", open_items: ["Add refresh tokens", "Write tests"] }
Output: { saved: true, date: "2026-03-04" }
```

## MCP Resources

The server exposes project context as an MCP resource:

- **`memory://project/context`** — Current project's conventions, decisions, architecture, bugs, and TODOs. MCP clients that support resources can auto-load this at session start.

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

**Markdown is the source of truth.** You can read, edit, or delete any memory file with a text editor. The SQLite database is the search index.

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

## Advanced: Auto-Init Options

The server auto-detects your project in this order:

1. **CLI argument**: `--project-path /path/to/project`
2. **Environment variable**: `SHACKLEAI_PROJECT_PATH=/path/to/project`
3. **Working directory**: Uses `process.cwd()` (this is what most MCP clients pass)

For explicit control, set the project path in your MCP config:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@shackleai/memory-mcp", "--project-path", "/path/to/project"]
    }
  }
}
```

Or via environment variable:

```json
{
  "mcpServers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@shackleai/memory-mcp"],
      "env": {
        "SHACKLEAI_PROJECT_PATH": "/path/to/project"
      }
    }
  }
}
```

## Troubleshooting

### "Cannot connect to MCP server" / Server fails to start

**Most common cause**: Old `npx` version (< 7.0). Check with `npx --version`. If it shows 6.x:

```bash
# Option 1: Install globally instead
npm install -g @shackleai/memory-mcp
# Then for Claude Code:
claude mcp add memory -- shackleai-memory

# Option 2: Update npm (gets you a modern npx)
npm install -g npm@latest

# Option 3: Run from source (no npx needed)
git clone https://github.com/shackleai/memory-mcp.git
cd memory-mcp && npm install && npm run build
claude mcp add memory -- node /absolute/path/to/memory-mcp/dist/index.js
```

### Claude Code: "memory" not showing in `claude mcp list`

Claude Code stores MCP config in `~/.claude.json` (NOT `~/.claude/mcp.json`). Always use the CLI to add servers:

```bash
claude mcp add memory -- npx -y @shackleai/memory-mcp
# Verify:
claude mcp list
# Should show: memory: ✓ Connected
```

Do NOT manually edit `~/.claude/mcp.json` — Claude Code ignores that file.

### First tool call is slow

The embedding model (~80MB) downloads on first use. This is a one-time download. Subsequent runs use the cached model and are fast.

### Memory not persisting between sessions

Check that `~/.shackleai/` directory exists and has write permissions. The server creates it automatically on first run.

### Wrong project detected

Use `--project-path` to explicitly set the project, or call `memory_init` with the correct path.

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
