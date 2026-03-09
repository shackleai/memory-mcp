# Changelog

All notable changes to `@shackleai/memory-mcp` will be documented in this file.

## [Unreleased]

### Added
- **Cloud mode** — memories can now persist via ShackleAI Gateway (`gateway.shackleai.com/mcp`) using PostgreSQL + pgvector for server-side storage and semantic search.
- **Unified account API keys** — cloud mode authenticates with a single `sk_shackle_*` key obtained from the ShackleAI dashboard (Settings > API Keys). No separate per-service keys needed.
- All 11 MCP tools work identically in both local and cloud modes.

## [0.5.2] — 2026-03-04

### Fixed
- npx setup compatibility with older npm versions.
- First-run embedding model download reliability.

## [0.5.0] — 2026-02-28

### Added
- `memory_status` tool for TODO status management (pending/in_progress/done).
- `memory_cleanup` tool to archive done TODOs and delete stale memories.
- `memory_export` and `memory_import` tools for JSON backup and bulk import.
- MCP resource `memory://project/context` for auto-loading project context.
- Auto-init on server startup — no need to call `memory_init` manually.
- Tech stack auto-detection for projects.

## [0.4.0] — 2026-02-15

### Added
- `npx -y @shackleai/memory-mcp@latest setup` one-command setup.
- `.mcp.json` generation for project-level MCP configuration.
- Automatic CLAUDE.md generation with memory instructions.
- Global install support via `shackleai-memory` binary.

## [0.3.0] — 2026-01-20

### Added
- Semantic deduplication with configurable cosine similarity threshold.
- Auto-archive for old session files.
- Hit count tracking on `memory_search` results.
- Configurable `config.yaml` support.

## [0.2.0] — 2026-01-05

### Added
- Local embedding generation via MiniLM-L6-v2 (offline, free).
- Vector search with sqlite-vec for KNN similarity.
- Markdown file storage as human-readable source of truth.
- Multi-project support with auto-detection.

## [0.1.0] — 2025-12-15

### Added
- Initial release with core MCP tools: init, store, search, update, delete, list_projects, session_end.
- SQLite storage backend.
- stdio transport for MCP clients.
