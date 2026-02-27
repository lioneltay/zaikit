import { initTRPC } from "@trpc/server";
import { z } from "zod";
import type { Agent } from "@lioneltay/aikit-core";

export function createAppRouter(agent: Agent) {
  if (!agent.memory) {
    throw new Error("createAppRouter requires an agent with memory configured");
  }
  const memory = agent.memory;
  const t = initTRPC.create();

  return t.router({
    thread: t.router({
      list: t.procedure.query(async () => {
        return memory.listThreads();
      }),

      delete: t.procedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }) => {
          await memory.deleteThread(input.id);
        }),

      update: t.procedure
        .input(z.object({ id: z.string(), title: z.string().optional() }))
        .mutation(async ({ input }) => {
          return memory.updateThread(input.id, { title: input.title });
        }),

      getMessages: t.procedure
        .input(z.object({ threadId: z.string() }))
        .query(async ({ input }) => {
          return memory.getMessages(input.threadId);
        }),
    }),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
