import type { Agent } from "@zaikit/core";
import { createInMemoryMemory } from "@zaikit/memory-inmemory";
import { createSandboxHono } from "./adapters/hono";
import {
  type NormalizedAgentEntry,
  type NormalizedSandboxConfig,
  normalizeAgentEntry,
  type SandboxConfig,
} from "./types";

export type { SandboxAgentEntry, SandboxConfig } from "./types";

function ensureMemory(
  entries: Record<string, NormalizedAgentEntry>,
): Record<string, NormalizedAgentEntry> {
  const result: Record<string, NormalizedAgentEntry> = {};
  for (const [name, entry] of Object.entries(entries)) {
    if (entry.agent.memory) {
      result[name] = entry;
    } else {
      const agent: Agent = {
        ...entry.agent,
        memory: createInMemoryMemory(),
      };
      result[name] = { ...entry, agent };
    }
  }
  return result;
}

export function createSandbox(config: SandboxConfig) {
  const normalized: Record<string, NormalizedAgentEntry> = {};
  for (const [name, entry] of Object.entries(config.agents)) {
    normalized[name] = normalizeAgentEntry(entry);
  }

  const agents = ensureMemory(normalized);
  const normalizedConfig: NormalizedSandboxConfig = {
    ...config,
    agents,
  };

  const app = createSandboxHono(normalizedConfig);

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
