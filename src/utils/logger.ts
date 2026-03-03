// CRITICAL: Never use console.log in stdio MCP servers.
// stdout is reserved for MCP protocol messages.
// All logging goes to stderr via console.error.

const PREFIX = "[ShackleAI]";

export const logger = {
  info: (...args: unknown[]) => console.error(PREFIX, ...args),
  warn: (...args: unknown[]) => console.error(PREFIX, "WARN:", ...args),
  error: (...args: unknown[]) => console.error(PREFIX, "ERROR:", ...args),
  debug: (...args: unknown[]) => {
    if (process.env.SHACKLE_DEBUG === "1") {
      console.error(PREFIX, "DEBUG:", ...args);
    }
  },
};
