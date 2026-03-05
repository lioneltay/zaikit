import type { Agent } from "@zaikit/core";

export type SandboxAgentEntry =
  | Agent<any, any>
  | { agent: Agent<any, any>; context?: unknown };

export type SandboxConfig = {
  agents: Record<string, SandboxAgentEntry>;
  /** Mount prefix (e.g. "/sandbox"). Used to inject <base href> so SPA deep-links work. */
  basePath?: string;
};

/** Internal normalized form — every entry has agent + optional context. */
export type NormalizedAgentEntry = {
  agent: Agent<any, any>;
  context: Record<string, unknown> | undefined;
};

export type NormalizedSandboxConfig = {
  agents: Record<string, NormalizedAgentEntry>;
  basePath?: string;
};

export function normalizeAgentEntry(
  entry: SandboxAgentEntry,
): NormalizedAgentEntry {
  if ("chat" in entry) {
    return { agent: entry, context: undefined };
  }
  return {
    agent: entry.agent,
    context: entry.context as Record<string, unknown> | undefined,
  };
}

export function normalizeSandboxConfig(
  config: SandboxConfig | NormalizedSandboxConfig,
): NormalizedSandboxConfig {
  const agents: Record<string, NormalizedAgentEntry> = {};
  for (const [name, entry] of Object.entries(config.agents)) {
    // normalizeAgentEntry is idempotent — safe to call on already-normalized entries
    agents[name] = normalizeAgentEntry(entry as SandboxAgentEntry);
  }
  return { ...config, agents };
}
