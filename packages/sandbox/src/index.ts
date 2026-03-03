import type { Agent } from "@zaikit/core";
import { createInMemoryMemory } from "@zaikit/memory-inmemory";
import { createSandboxHono } from "./adapters/hono";
import type { SandboxConfig } from "./types";

export type { SandboxConfig } from "./types";

function ensureMemory(agents: Record<string, Agent>): Record<string, Agent> {
  const result: Record<string, Agent> = {};
  for (const [name, agent] of Object.entries(agents)) {
    if (agent.memory) {
      result[name] = agent;
    } else {
      result[name] = { ...agent, memory: createInMemoryMemory() };
    }
  }
  return result;
}

export function createSandbox(config: SandboxConfig) {
  const agents = ensureMemory(config.agents);
  const sandboxConfig: SandboxConfig = { ...config, agents };

  const app = createSandboxHono(sandboxConfig);

  return {
    app,
    listen(port: number = 4000) {
      // Dynamic import to avoid bundling @hono/node-server when not used
      import("@hono/node-server").then(({ serve }) => {
        serve({ fetch: app.fetch, port }, (info) => {
          console.log(
            `\n  ZAIKit Sandbox running at http://localhost:${info.port}\n`,
          );
          console.log(`  Agents: ${Object.keys(agents).join(", ")}\n`);
        });
      });
    },
  };
}
