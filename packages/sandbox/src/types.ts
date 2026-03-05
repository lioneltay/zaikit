import type { Agent } from "@zaikit/core";

export type SandboxConfig = {
  agents: Record<string, Agent<any, any>>;
  /** Mount prefix (e.g. "/sandbox"). Used to inject <base href> so SPA deep-links work. */
  basePath?: string;
};
