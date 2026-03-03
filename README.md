# ShackleAI Memory

**Persistent memory for AI coding tools.** The first MCP-native memory server.

Give Claude Code, Cursor, Windsurf, VS Code Copilot, or any MCP-compatible AI tool persistent memory across sessions. Your AI remembers decisions, conventions, bugs, and context — picks up exactly where you left off.

## Quick Start

Add one line to your MCP config:

**Claude Code** (`~/.claude/mcp.json`):
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

**Cursor** (`~/.cursor/mcp.json`) — same format.

That's it. Start coding. Your AI now has memory.

## What It Does

1. Session starts → AI calls `memory_init` → loads relevant past context
2. During session → AI calls `memory_store` → saves decisions, conventions, bugs
3. Session ends → AI calls `memory_session_end` → persists session summary
4. Next session → AI picks up where you left off

## Features

- **7 MCP tools**: init, store, search, update, delete, list projects, session end
- **Local-first**: Everything stored on your machine at `~/.shackleai/`
- **Zero config**: No API keys, no cloud account, no setup
- **Offline**: Local embeddings via MiniLM-L6-v2 (downloads once, ~80MB)
- **Human-readable**: Memories stored as Markdown files — read/edit with any text editor
- **Git-friendly**: Version control your AI's memory
- **Semantic search**: Find relevant memories by meaning, not just keywords
- **Deduplication**: Automatically detects and merges duplicate memories
- **Multi-project**: Separate memory spaces per project

## MCP Tools

| Tool | Description |
|------|-------------|
| `memory_init` | Load project context at session start |
| `memory_store` | Save a decision, convention, bug, or any important info |
| `memory_search` | Semantic search across past memories |
| `memory_update` | Update an existing memory |
| `memory_delete` | Remove a memory |
| `memory_list_projects` | List all projects with stored memories |
| `memory_session_end` | Save session summary and open items |

## Storage

All data lives locally:

```
~/.shackleai/
  db/memory.db                    SQLite + vector index
  projects/
    my-project/
      decisions.md                Key decisions with reasoning
      conventions.md              Coding standards
      bugs.md                     Known issues
      sessions/
        2026-03-04.md             Today's session summary
  config.yaml                     Optional configuration
```

## Configuration (Optional)

Create `~/.shackleai/config.yaml`:

```yaml
embedding:
  provider: local          # local (free) or openai (requires API key)
max_memories_per_project: 10000
max_session_history_days: 90
auto_dedup: true
dedup_threshold: 0.9
```

## License

MIT — free and open source forever.

---

*The shackle that keeps your AI anchored.* Built by [ShackleAI](https://shackleai.com).
