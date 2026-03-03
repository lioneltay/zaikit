import type {
  Request as ExpressRequest,
  Response as ExpressResponse,
  Router,
} from "express";
import { getAgentDetail, listAgents } from "../routes/agents";
import { executeTool } from "../routes/tools";
import { serveIndexHtml, serveStaticFile } from "../static";
import type { SandboxConfig } from "../types";

async function sendFetchResponse(
  fetchRes: Response,
  expressRes: ExpressResponse,
) {
  expressRes.status(fetchRes.status);
  fetchRes.headers.forEach((value, key) => {
    expressRes.setHeader(key, value);
  });
  if (fetchRes.body) {
    const reader = fetchRes.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      expressRes.write(value);
    }
  }
  expressRes.end();
}

function param(req: ExpressRequest, key: string): string {
  const v = req.params[key];
  return Array.isArray(v) ? v[0] : v;
}

export function createSandboxExpress(config: SandboxConfig): Router {
  // Lazy-import express to avoid hard dependency
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const express = require("express");
  const router: Router = express.Router();

  function getAgent(name: string) {
    return config.agents[name];
  }

  function getMemory(name: string) {
    const agent = getAgent(name);
    if (!agent) return null;
    if (!agent.memory) throw new Error("Agent has no memory configured.");
    return agent.memory;
  }

  router.get("/api/agents", (_req: ExpressRequest, res: ExpressResponse) => {
    res.json(listAgents(config.agents));
  });

  router.get(
    "/api/agents/:name",
    (req: ExpressRequest, res: ExpressResponse) => {
      const name = param(req, "name");
      const agent = getAgent(name);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      res.json(getAgentDetail(name, agent));
    },
  );

  router.post(
    "/api/agents/:name/chat",
    async (req: ExpressRequest, res: ExpressResponse) => {
      const name = param(req, "name");
      const agent = getAgent(name);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      const fetchRes = await agent.chat(
        req.body as Parameters<typeof agent.chat>[0],
      );
      await sendFetchResponse(fetchRes, res);
    },
  );

  router.get(
    "/api/agents/:name/threads",
    async (req: ExpressRequest, res: ExpressResponse) => {
      const name = param(req, "name");
      const memory = getMemory(name);
      if (!memory) return res.status(404).json({ error: "Agent not found" });
      res.json(await memory.listThreads({ ownerId: name }));
    },
  );

  router.get(
    "/api/agents/:name/threads/:threadId/messages",
    async (req: ExpressRequest, res: ExpressResponse) => {
      const name = param(req, "name");
      const memory = getMemory(name);
      if (!memory) return res.status(404).json({ error: "Agent not found" });
      res.json(await memory.getMessages(param(req, "threadId")));
    },
  );

  router.delete(
    "/api/agents/:name/threads/:threadId",
    async (req: ExpressRequest, res: ExpressResponse) => {
      const name = param(req, "name");
      const memory = getMemory(name);
      if (!memory) return res.status(404).json({ error: "Agent not found" });
      await memory.deleteThread(param(req, "threadId"));
      res.json({ ok: true });
    },
  );

  router.post(
    "/api/agents/:name/tools/:toolName/execute",
    async (req: ExpressRequest, res: ExpressResponse) => {
      const name = param(req, "name");
      const agent = getAgent(name);
      if (!agent) return res.status(404).json({ error: "Agent not found" });
      const result = await executeTool(
        agent,
        param(req, "toolName"),
        req.body?.input,
      );
      res.status(result.ok ? 200 : 400).json(result);
    },
  );

  // Static files + SPA fallback
  router.get("*", (req: ExpressRequest, res: ExpressResponse) => {
    const pathname = req.path;
    const staticRes = serveStaticFile(pathname);
    if (staticRes) {
      res.setHeader(
        "Content-Type",
        staticRes.headers.get("Content-Type") || "application/octet-stream",
      );
      staticRes.arrayBuffer().then((buf) => {
        res.send(Buffer.from(buf));
      });
      return;
    }
    const indexRes = serveIndexHtml(config.basePath);
    if (indexRes) {
      res.setHeader("Content-Type", "text/html");
      indexRes.text().then((html) => res.send(html));
      return;
    }
    res.status(404).send("Not found");
  });

  return router;
}
