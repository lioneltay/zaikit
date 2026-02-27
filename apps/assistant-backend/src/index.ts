import { Hono } from "hono";
import { cors } from "hono/cors";
import { serve } from "@hono/node-server";
import { streamText, convertToModelMessages, model } from "@lioneltay/aikit-core";

const app = new Hono();

app.use(
  "/api/*",
  cors({
    origin: "http://localhost:7300",
  })
);

app.get("/health", (c) => {
  return c.json({ status: "ok" });
});

app.post("/api/chat", async (c) => {
  const { messages } = await c.req.json();

  const result = streamText({
    model,
    messages: await convertToModelMessages(messages),
  });

  return result.toUIMessageStreamResponse();
});

serve({ fetch: app.fetch, port: 7301 }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});
