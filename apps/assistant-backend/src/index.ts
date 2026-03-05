import { serve } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { createSandboxHono } from "@zaikit/sandbox/hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { agent } from "./agent/index";
import { createAppRouter } from "./trpc";

const appRouter = createAppRouter(agent);

const app = new Hono();

app.use("*", cors({ origin: "http://localhost:7300" }));

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

// tRPC handler
app.all("/trpc/*", async (c) => {
  const response = await fetchRequestHandler({
    endpoint: "/trpc",
    req: c.req.raw,
    router: appRouter,
    createContext: () => ({}),
  });
  return response;
});

// Streaming chat endpoint
app.post("/api/chat", async (c) => {
  const body = await c.req.json();
  // In a real app, context would come from auth middleware / session.
  // Here we hardcode example values for demonstration.
  return agent.chat({
    ...body,
    context: {
      userId: "user-123",
      orgId: "org-456",
      orgName: "Acme Corp",
    },
  });
});

// Sandbox UI at /sandbox
const sandbox = createSandboxHono({
  agents: { assistant: agent },
  basePath: "/sandbox",
});
app.route("/sandbox", sandbox);

serve({ fetch: app.fetch, port: 7301 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
  console.log(`Sandbox UI at http://localhost:${info.port}/sandbox`);
});
