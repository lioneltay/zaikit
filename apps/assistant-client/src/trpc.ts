import { createTRPCClient, httpBatchLink } from "@trpc/client";
import type { AppRouter } from "@lioneltay/aikit-assistant-backend/trpc";

export const trpc = createTRPCClient<AppRouter>({
  links: [
    httpBatchLink({
      url: "http://localhost:7301/trpc",
    }),
  ],
});

export type Thread = Awaited<ReturnType<typeof trpc.thread.list.query>>[number];
