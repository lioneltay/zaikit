import { initTRPC } from "@trpc/server";
import type { Agent } from "@zaikit/core";
import { z } from "zod";

export function createAppRouter(agent: Agent<any, any>) {
  if (!agent.memory) {
    throw new Error("createAppRouter requires an agent with memory configured");
  }
  const memory = agent.memory;
  const t = initTRPC.create();

  return t.router({
    thread: t.router({
      list: t.procedure
        .input(z.object({ ownerId: z.string().optional() }).optional())
        .query(async ({ input }) => {
          return memory.listThreads(input ?? undefined);
        }),

      delete: t.procedure
        .input(z.object({ id: z.string() }))
        .mutation(async ({ input }) => {
          await memory.deleteThread(input.id);
        }),

      update: t.procedure
        .input(
          z.object({
            id: z.string(),
            title: z.string().optional(),
            ownerId: z.string().optional(),
          }),
        )
        .mutation(async ({ input }) => {
          return memory.updateThread(input.id, {
            title: input.title,
            ownerId: input.ownerId,
          });
        }),

      getMessages: t.procedure
        .input(
          z.object({
            threadId: z.string(),
            limit: z.number().int().positive().optional(),
          }),
        )
        .query(async ({ input }) => {
          return memory.getMessages(
            input.threadId,
            input.limit ? { limit: input.limit } : undefined,
          );
        }),
    }),
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;
