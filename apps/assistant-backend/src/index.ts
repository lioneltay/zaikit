import { serve } from "@hono/node-server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
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
  return agent.chat(body);
});

serve({ fetch: app.fetch, port: 7301 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
