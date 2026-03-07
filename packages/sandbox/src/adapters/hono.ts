import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  getAgentDetail,
  getAgentToolSchemas,
  listAgents,
} from "../routes/agents";
import { executeTool } from "../routes/tools";
import { serveIndexHtml, serveStaticFile } from "../static";
import {
  type NormalizedSandboxConfig,
  normalizeSandboxConfig,
  type SandboxConfig,
} from "../types";

export function createSandboxHono(
  rawConfig: SandboxConfig | NormalizedSandboxConfig,
) {
  const config = normalizeSandboxConfig(rawConfig);
  const app = new Hono();

  app.use("*", cors());

  function getEntry(name: string) {
    return config.agents[name];
  }

  function getMemory(name: string) {
    const entry = getEntry(name);
    if (!entry) return null;
    if (!entry.agent.memory) throw new Error("Agent has no memory configured.");
    return entry.agent.memory;
  }

  // --- API Routes ---

  app.get("/api/agents", (c) => {
    return c.json(listAgents(config.agents));
  });

  app.get("/api/agents/:name", (c) => {
    const name = c.req.param("name");
    const entry = getEntry(name);
    if (!entry) return c.json({ error: "Agent not found" }, 404);
    return c.json(getAgentDetail(name, entry));
  });

  app.get("/api/agents/:name/schemas", (c) => {
    const name = c.req.param("name");
    const entry = getEntry(name);
    if (!entry) return c.json({ error: "Agent not found" }, 404);
    return c.json(getAgentToolSchemas(entry));
  });

  app.post("/api/agents/:name/chat", async (c) => {
    const name = c.req.param("name");
    const entry = getEntry(name);
    if (!entry) return c.json({ error: "Agent not found" }, 404);
    const body = await c.req.json();
    // Merge: runtime context is the base, request context overrides
    const mergedContext = { ...entry.context, ...body.context };
    return entry.agent.chat({
      ...body,
      context: mergedContext,
    } as Parameters<typeof entry.agent.chat>[0]);
  });

  app.get("/api/agents/:name/threads", async (c) => {
    const name = c.req.param("name");
    const memory = getMemory(name);
    if (!memory) return c.json({ error: "Agent not found" }, 404);
    return c.json(await memory.listThreads({ ownerId: name }));
  });

  app.get("/api/agents/:name/threads/:threadId/messages", async (c) => {
    const name = c.req.param("name");
    const memory = getMemory(name);
    if (!memory) return c.json({ error: "Agent not found" }, 404);
    const limit = c.req.query("limit");
    return c.json(
      await memory.getMessages(
        c.req.param("threadId"),
        limit ? { limit: Number(limit) } : undefined,
      ),
    );
  });

  app.delete("/api/agents/:name/threads/:threadId", async (c) => {
    const name = c.req.param("name");
    const memory = getMemory(name);
    if (!memory) return c.json({ error: "Agent not found" }, 404);
    await memory.deleteThread(c.req.param("threadId"));
    return c.json({ ok: true });
  });

  app.post("/api/agents/:name/tools/:toolName/execute", async (c) => {
    const name = c.req.param("name");
    const entry = getEntry(name);
    if (!entry) return c.json({ error: "Agent not found" }, 404);
    const body = await c.req.json();
    // Merge: runtime context is the base, request context overrides
    const mergedContext = { ...entry.context, ...body.context };
    const result = await executeTool(
      entry.agent,
      c.req.param("toolName"),
      body.input,
      mergedContext,
    );
    return c.json(result, result.ok ? 200 : 400);
  });

  // --- Static files (embedded frontend) ---

  app.get("/assets/*", (c) => {
    // c.req.path includes the full mount prefix (e.g. /sandbox/assets/...).
    // Extract just the "/assets/..." portion for static file lookup.
    const fullPath = c.req.path;
    const assetsIdx = fullPath.indexOf("/assets/");
    const assetPath = assetsIdx >= 0 ? fullPath.slice(assetsIdx) : fullPath;
    const response = serveStaticFile(assetPath);
    if (response) return response;
    return c.notFound();
  });

  // SPA fallback — serve index.html for all non-API, non-asset routes
  app.get("*", (c) => {
    const response = serveIndexHtml(config.basePath);
    if (response) return response;
    return c.notFound();
  });

  return app;
}
