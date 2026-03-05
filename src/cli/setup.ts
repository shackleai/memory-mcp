import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const MCP_CONFIG_FILE = ".mcp.json";

const MEMORY_SERVER_CONFIG = {
  command: "npx",
  args: ["-y", "@shackleai/memory-mcp@latest"],
};

// Shared memory instructions — used across all client formats
const MEMORY_RULES = `This project uses ShackleAI Memory for persistent context across sessions.

Session Start (REQUIRED):
- Call memory_init with this project's directory path
- Call memory_search to load prior context about the current task

When to Call memory_store (REQUIRED — do not skip):
Call memory_store IMMEDIATELY when any of these happen:
- Technical decision made (chose a library, picked an approach) → category: "decision"
- Pattern or convention established → category: "convention"
- Bug discovered or fixed → category: "bug"
- Architecture or system design learned → category: "architecture"
- User preference learned → category: "preference"
- Incomplete work identified → category: "todo"
- Important project fact learned → category: "context"

Rule: If you completed a task and didn't call memory_store, you forgot. Go back and store what you learned.

Session End (REQUIRED):
- Call memory_session_end with a summary before the conversation ends`;

// Client-specific instruction templates
const CLAUDE_MD_CONTENT = `## Memory

${MEMORY_RULES}
`;

const CURSOR_RULES_CONTENT = `---
description: ShackleAI Memory — persistent context across sessions
globs: **/*
alwaysApply: true
---

${MEMORY_RULES}
`;

const WINDSURF_RULES_CONTENT = MEMORY_RULES;

const COPILOT_INSTRUCTIONS_CONTENT = `# ShackleAI Memory

${MEMORY_RULES}
`;

const CLINE_RULES_CONTENT = MEMORY_RULES;

// Claude Code hooks — nudge the AI at key moments
const HOOKS_CONFIG = {
  hooks: {
    UserPromptSubmit: [
      {
        hooks: [
          {
            type: "command" as const,
            command: `node -e "process.stdout.write(JSON.stringify({message:'MEMORY: After completing this task, call memory_store if you made any decisions, found bugs, or established conventions.'}))"`,
          },
        ],
      },
    ],
    Stop: [
      {
        hooks: [
          {
            type: "command" as const,
            command: `node -e "process.stdout.write(JSON.stringify({message:'MEMORY: Before ending — did you call memory_store for important findings this session? If not, do it now. Then call memory_session_end with a summary.'}))"`,
          },
        ],
      },
    ],
  },
};

function isOutdatedConfig(existing: Record<string, unknown>): boolean {
  if (existing.command === "node") return true;
  const args = existing.args as string[] | undefined;
  if (!args) return true;
  if (existing.command === "npx" && !args.includes("-y")) return true;
  if (existing.command === "npx" && !args.some((a) => a.includes("@latest")))
    return true;
  return false;
}

function setupMcpConfig(cwd: string): void {
  const configPath = join(cwd, MCP_CONFIG_FILE);

  let config: Record<string, unknown> = {};
  let existed = false;

  if (existsSync(configPath)) {
    existed = true;
    try {
      config = JSON.parse(readFileSync(configPath, "utf-8"));
    } catch {
      console.error(`Error: ${MCP_CONFIG_FILE} exists but is not valid JSON.`);
      process.exit(1);
    }
  }

  if (!config.mcpServers || typeof config.mcpServers !== "object") {
    config.mcpServers = {};
  }

  const servers = config.mcpServers as Record<string, unknown>;
  const existing = servers.memory as Record<string, unknown> | undefined;
  const needsUpdate = !existing || isOutdatedConfig(existing);

  if (needsUpdate) {
    const wasUpgrade = !!existing;
    servers.memory = MEMORY_SERVER_CONFIG;
    writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");
    if (wasUpgrade) {
      console.log(`\u2713 Upgraded memory server config in ${MCP_CONFIG_FILE}`);
    } else if (existed) {
      console.log(
        `\u2713 Added memory server to existing ${MCP_CONFIG_FILE}`
      );
    } else {
      console.log(`\u2713 Created ${MCP_CONFIG_FILE} with memory server`);
    }
  } else {
    console.log(`\u2713 memory server already configured in ${MCP_CONFIG_FILE}`);
  }
}

// Write a client instruction file if it doesn't already have memory instructions
function writeInstructionFile(
  filePath: string,
  content: string,
  label: string,
  marker: string = "ShackleAI Memory"
): boolean {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, "utf-8");
    if (existing.includes(marker) || existing.includes("memory_store")) {
      console.log(`\u2713 ${label} already has memory instructions`);
      return false;
    }
    writeFileSync(filePath, existing.trimEnd() + "\n\n" + content);
    console.log(`\u2713 Added memory instructions to existing ${label}`);
    return true;
  }
  return false; // File doesn't exist — only create if the client is detected
}

function setupClientInstructions(cwd: string): void {
  // === Claude Code (CLAUDE.md) — always create ===
  const claudeMdPath = join(cwd, "CLAUDE.md");
  if (existsSync(claudeMdPath)) {
    writeInstructionFile(claudeMdPath, CLAUDE_MD_CONTENT, "CLAUDE.md");
  } else {
    writeFileSync(claudeMdPath, CLAUDE_MD_CONTENT);
    console.log("\u2713 Created CLAUDE.md with memory instructions");
  }

  // === Cursor (.cursor/rules/memory.mdc) — create if .cursor/ exists or Cursor config found ===
  const cursorDir = join(cwd, ".cursor");
  const cursorRulesDir = join(cursorDir, "rules");
  const cursorRulePath = join(cursorRulesDir, "memory.mdc");
  if (existsSync(cursorDir) || existsSync(join(cwd, ".cursorrc"))) {
    mkdirSync(cursorRulesDir, { recursive: true });
    if (!existsSync(cursorRulePath)) {
      writeFileSync(cursorRulePath, CURSOR_RULES_CONTENT);
      console.log(
        "\u2713 Created .cursor/rules/memory.mdc for Cursor"
      );
    } else {
      console.log(
        "\u2713 .cursor/rules/memory.mdc already exists"
      );
    }
  }

  // === Windsurf (.windsurfrules) — create if exists ===
  const windsurfPath = join(cwd, ".windsurfrules");
  if (existsSync(windsurfPath)) {
    writeInstructionFile(
      windsurfPath,
      WINDSURF_RULES_CONTENT,
      ".windsurfrules"
    );
  }

  // === VS Code Copilot (.github/copilot-instructions.md) — create if .github/ exists ===
  const githubDir = join(cwd, ".github");
  const copilotPath = join(githubDir, "copilot-instructions.md");
  if (existsSync(githubDir)) {
    if (existsSync(copilotPath)) {
      writeInstructionFile(
        copilotPath,
        COPILOT_INSTRUCTIONS_CONTENT,
        ".github/copilot-instructions.md"
      );
    } else {
      writeFileSync(copilotPath, COPILOT_INSTRUCTIONS_CONTENT);
      console.log(
        "\u2713 Created .github/copilot-instructions.md for VS Code Copilot"
      );
    }
  }

  // === Cline (.clinerules) — create if exists ===
  const clinePath = join(cwd, ".clinerules");
  if (existsSync(clinePath)) {
    writeInstructionFile(clinePath, CLINE_RULES_CONTENT, ".clinerules");
  }
}

function setupHooks(cwd: string): void {
  const claudeDir = join(cwd, ".claude");
  const settingsPath = join(claudeDir, "settings.json");

  if (!existsSync(claudeDir)) {
    mkdirSync(claudeDir, { recursive: true });
  }

  if (existsSync(settingsPath)) {
    try {
      const existing = JSON.parse(readFileSync(settingsPath, "utf-8"));
      if (existing.hooks) {
        console.log(
          "\u2713 .claude/settings.json already has hooks configured"
        );
        return;
      }
      existing.hooks = HOOKS_CONFIG.hooks;
      writeFileSync(settingsPath, JSON.stringify(existing, null, 2) + "\n");
      console.log(
        "\u2713 Added memory hooks to existing .claude/settings.json"
      );
    } catch {
      console.error(
        "Warning: .claude/settings.json exists but is not valid JSON, skipping hooks setup"
      );
      return;
    }
  } else {
    writeFileSync(settingsPath, JSON.stringify(HOOKS_CONFIG, null, 2) + "\n");
    console.log("\u2713 Created .claude/settings.json with memory hooks");
  }
}

export function runSetup(): void {
  const cwd = process.cwd();

  console.log("Setting up ShackleAI Memory...\n");

  // 1. MCP config (universal — all clients read this)
  setupMcpConfig(cwd);

  // 2. Client-specific instruction files
  setupClientInstructions(cwd);

  // 3. Claude Code hooks (nudge at right moments)
  setupHooks(cwd);

  console.log(
    `\nYou're all set! Start your AI tool in this directory and memory will be active.\n`
  );
  console.log("  Claude Code:  claude");
  console.log("  Cursor:       Open this folder in Cursor");
  console.log("  Windsurf:     Open this folder in Windsurf");
  console.log("  VS Code:      Open this folder in VS Code\n");
  console.log(
    "Commit .mcp.json and CLAUDE.md to git so your team gets memory too."
  );
  console.log(
    "First run downloads the embedding model (~80MB, one-time). After that, everything works offline."
  );
}
