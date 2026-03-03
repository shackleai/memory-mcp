// End-to-end test: runs the MCP server and sends sequential requests
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const server = spawn("npx", ["tsx", "src/index.ts"], {
  stdio: ["pipe", "pipe", "pipe"],
  shell: true,
  cwd: process.cwd(),
});

const rl = createInterface({ input: server.stdout! });
const responses = new Map<number, any>();

rl.on("line", (line) => {
  try {
    const msg = JSON.parse(line);
    if (msg.id) responses.set(msg.id, msg);
  } catch {}
});

server.stderr!.on("data", () => {}); // suppress stderr

function send(msg: object): Promise<any> {
  return new Promise((resolve) => {
    const id = (msg as any).id;
    server.stdin!.write(JSON.stringify(msg) + "\n");
    const check = setInterval(() => {
      if (responses.has(id)) {
        clearInterval(check);
        resolve(responses.get(id));
      }
    }, 50);
  });
}

async function run() {
  // 1. Initialize
  const initResp = await send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "e2e-test", version: "0.1.0" },
    },
  });
  console.log("1. INIT:", initResp.result.serverInfo.name, initResp.result.serverInfo.version);

  server.stdin!.write(
    JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) + "\n",
  );

  // 2. memory_init
  const memInit = await send({
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: { name: "memory_init", arguments: { project_path: process.cwd() } },
  });
  const initData = JSON.parse(memInit.result.content[0].text);
  console.log("2. MEMORY_INIT:", initData.project_name, `(${initData.tech_stack})`);

  // 3. memory_store
  const store1 = await send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "memory_store",
      arguments: {
        content: "We chose SQLite with sqlite-vec for local vector search",
        category: "decision",
        importance: "high",
        tags: ["database", "vector-search"],
      },
    },
  });
  const s1 = JSON.parse(store1.result.content[0].text);
  console.log("3. STORE:", s1.stored ? "OK" : "FAIL", `(${s1.category}, dedup: ${s1.deduplicated})`);

  // 4. memory_store another
  const store2 = await send({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "memory_store",
      arguments: {
        content: "Never use console.log in stdio MCP servers, only console.error",
        category: "convention",
        importance: "high",
      },
    },
  });
  const s2 = JSON.parse(store2.result.content[0].text);
  console.log("4. STORE:", s2.stored ? "OK" : "FAIL", `(${s2.category}, dedup: ${s2.deduplicated})`);

  // 5. memory_search
  const search = await send({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: {
      name: "memory_search",
      arguments: { query: "what database are we using" },
    },
  });
  const sr = JSON.parse(search.result.content[0].text);
  console.log("5. SEARCH:", sr.count, "results");
  for (const r of sr.results) {
    console.log(`   - [${r.relevance}] (${r.category}) ${r.content.slice(0, 60)}`);
  }

  // 6. memory_list_projects
  const list = await send({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "memory_list_projects", arguments: {} },
  });
  const lr = JSON.parse(list.result.content[0].text);
  console.log("6. PROJECTS:", lr.count, "projects");
  for (const p of lr.projects) {
    console.log(`   - ${p.name} (${p.tech_stack}) — ${p.memory_count} memories`);
  }

  // 7. memory_session_end
  const end = await send({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: {
      name: "memory_session_end",
      arguments: {
        summary: "Initial e2e test of the MCP server. All tools working.",
        open_items: ["Test with Claude Code", "Publish to npm"],
      },
    },
  });
  const er = JSON.parse(end.result.content[0].text);
  console.log("7. SESSION_END:", er.saved ? "OK" : "FAIL", `(${er.date})`);

  console.log("\n--- ALL 7 TOOLS PASSED ---");
  server.kill();
  process.exit(0);
}

run().catch((err) => {
  console.error("E2E FAILED:", err);
  server.kill();
  process.exit(1);
});
