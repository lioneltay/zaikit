import type { UIMessage } from "ai";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Memory } from "../types";

type MemoryConformanceOptions<TContext = void> = {
  /** Start backing infrastructure (e.g. testcontainer). Runs once before all tests. */
  start?: () => TContext | Promise<TContext>;
  /** Stop backing infrastructure. Runs once after all tests. */
  stop?: (ctx: TContext) => void | Promise<void>;
  /** Create a Memory instance. Framework handles initialize/clear/close. */
  create: (ctx: TContext) => Memory | Promise<Memory>;
};

export function memoryConformanceTests<TContext = void>({
  start,
  stop,
  create,
}: MemoryConformanceOptions<TContext>) {
  let ctx: TContext;
  let memory: Memory;

  const isPersistent = !!start;

  beforeAll(async () => {
    if (start) {
      ctx = await start();
    }
    // Create once to initialize schema
    const mem = await create(ctx);
    await mem.initialize();
    await mem.close();
  }, 60_000);

  afterAll(async () => {
    if (stop) {
      await stop(ctx);
    }
  });

  beforeEach(async () => {
    memory = await create(ctx);
    await memory.initialize();
    await memory.clear();
  });

  describe("Memory conformance", () => {
    describe("threads", () => {
      it("creates a thread and retrieves it", async () => {
        const thread = await memory.createThread("t1", "My Thread", "user-1");

        expect(thread.id).toBe("t1");
        expect(thread.title).toBe("My Thread");
        expect(thread.ownerId).toBe("user-1");
        expect(thread.createdAt).toBeInstanceOf(Date);
        expect(thread.updatedAt).toBeInstanceOf(Date);

        const retrieved = await memory.getThread("t1");
        expect(retrieved).not.toBeNull();
        expect(retrieved?.id).toBe("t1");
        expect(retrieved?.title).toBe("My Thread");
        expect(retrieved?.ownerId).toBe("user-1");
      });

      it("creates a thread with defaults (no title, no ownerId)", async () => {
        const thread = await memory.createThread("t1");

        expect(thread.title).toBeNull();
        expect(thread.ownerId).toBeNull();
      });

      it("returns null for nonexistent thread", async () => {
        const thread = await memory.getThread("nonexistent");
        expect(thread).toBeNull();
      });

      it("lists threads ordered by updatedAt descending", async () => {
        await memory.createThread("t1", "First");
        // Small delay to ensure different timestamps
        await new Promise((r) => setTimeout(r, 5));
        await memory.createThread("t2", "Second");

        const threads = await memory.listThreads();
        expect(threads).toHaveLength(2);
        expect(threads[0].id).toBe("t2");
        expect(threads[1].id).toBe("t1");
      });

      it("filters threads by ownerId", async () => {
        await memory.createThread("t1", "A", "user-1");
        await memory.createThread("t2", "B", "user-2");
        await memory.createThread("t3", "C", "user-1");

        const threads = await memory.listThreads({ ownerId: "user-1" });
        expect(threads).toHaveLength(2);
        expect(threads.every((t) => t.ownerId === "user-1")).toBe(true);
      });

      it("updates thread title", async () => {
        await memory.createThread("t1", "Old Title");

        const updated = await memory.updateThread("t1", {
          title: "New Title",
        });
        expect(updated.title).toBe("New Title");

        const retrieved = await memory.getThread("t1");
        expect(retrieved?.title).toBe("New Title");
      });

      it("updates thread ownerId", async () => {
        await memory.createThread("t1", "Thread", "user-1");

        const updated = await memory.updateThread("t1", {
          ownerId: "user-2",
        });
        expect(updated.ownerId).toBe("user-2");
      });

      it("throws when updating nonexistent thread", async () => {
        await expect(
          memory.updateThread("nonexistent", { title: "X" }),
        ).rejects.toThrow();
      });

      it("deletes a thread", async () => {
        await memory.createThread("t1", "Thread");
        await memory.deleteThread("t1");

        const thread = await memory.getThread("t1");
        expect(thread).toBeNull();
      });

      it("cascade deletes messages when thread is deleted", async () => {
        await memory.createThread("t1");
        await memory.addMessage("t1", {
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        });

        await memory.deleteThread("t1");
        const msgs = await memory.getMessages("t1");
        expect(msgs).toHaveLength(0);
      });
    });

    describe("messages", () => {
      it("stores and retrieves messages in order", async () => {
        await memory.createThread("t1");

        const msg1: UIMessage = {
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        };
        const msg2: UIMessage = {
          id: "m2",
          role: "assistant",
          parts: [{ type: "text", text: "hi there" }],
        };

        await memory.addMessage("t1", msg1);
        await memory.addMessage("t1", msg2);

        const msgs = await memory.getMessages("t1");
        expect(msgs).toHaveLength(2);
        expect(msgs[0].id).toBe("m1");
        expect(msgs[0].role).toBe("user");
        expect(msgs[0].parts).toEqual([{ type: "text", text: "hello" }]);
        expect(msgs[1].id).toBe("m2");
        expect(msgs[1].role).toBe("assistant");
      });

      it("returns empty array for thread with no messages", async () => {
        await memory.createThread("t1");
        const msgs = await memory.getMessages("t1");
        expect(msgs).toHaveLength(0);
      });

      it("returns empty array for nonexistent thread", async () => {
        const msgs = await memory.getMessages("nonexistent");
        expect(msgs).toHaveLength(0);
      });

      it("upserts message with same id", async () => {
        await memory.createThread("t1");

        await memory.addMessage("t1", {
          id: "m1",
          role: "assistant",
          parts: [{ type: "text", text: "first" }],
        });
        await memory.addMessage("t1", {
          id: "m1",
          role: "assistant",
          parts: [{ type: "text", text: "updated" }],
        });

        const msgs = await memory.getMessages("t1");
        expect(msgs).toHaveLength(1);
        expect(msgs[0].parts).toEqual([{ type: "text", text: "updated" }]);
      });

      it("getMessages with limit returns the most recent N in order", async () => {
        await memory.createThread("t1");
        for (let i = 1; i <= 5; i++) {
          await memory.addMessage("t1", {
            id: `m${i}`,
            role: i % 2 === 1 ? "user" : "assistant",
            parts: [{ type: "text", text: `msg ${i}` }],
          });
        }

        const last2 = await memory.getMessages("t1", { limit: 2 });
        expect(last2).toHaveLength(2);
        expect(last2[0].id).toBe("m4");
        expect(last2[1].id).toBe("m5");
      });

      it("getMessages with limit greater than total returns all messages", async () => {
        await memory.createThread("t1");
        await memory.addMessage("t1", {
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "only one" }],
        });

        const msgs = await memory.getMessages("t1", { limit: 50 });
        expect(msgs).toHaveLength(1);
        expect(msgs[0].id).toBe("m1");
      });

      it("getMessages with no options returns all (backwards compat)", async () => {
        await memory.createThread("t1");
        await memory.addMessage("t1", {
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "a" }],
        });
        await memory.addMessage("t1", {
          id: "m2",
          role: "assistant",
          parts: [{ type: "text", text: "b" }],
        });

        const msgs = await memory.getMessages("t1");
        expect(msgs).toHaveLength(2);
        expect(msgs[0].id).toBe("m1");
        expect(msgs[1].id).toBe("m2");
      });

      it("updates message parts", async () => {
        await memory.createThread("t1");

        await memory.addMessage("t1", {
          id: "m1",
          role: "assistant",
          parts: [{ type: "text", text: "original" }],
        });

        await memory.updateMessage("t1", "m1", {
          parts: [
            { type: "text", text: "original" },
            { type: "text", text: " + more" },
          ],
        });

        const msgs = await memory.getMessages("t1");
        expect(msgs[0].parts).toEqual([
          { type: "text", text: "original" },
          { type: "text", text: " + more" },
        ]);
      });
    });

    describe.runIf(isPersistent)("persistence", () => {
      it("data survives reconnect", async () => {
        await memory.createThread("t1", "Persisted Thread", "user-1");
        await memory.addMessage("t1", {
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "hello" }],
        });
        await memory.close();

        // Create a fresh instance against the same store
        const mem2 = await create(ctx);
        await mem2.initialize();

        const thread = await mem2.getThread("t1");
        expect(thread).not.toBeNull();
        expect(thread?.title).toBe("Persisted Thread");
        expect(thread?.ownerId).toBe("user-1");

        const msgs = await mem2.getMessages("t1");
        expect(msgs).toHaveLength(1);
        expect(msgs[0].id).toBe("m1");
        expect(msgs[0].parts).toEqual([{ type: "text", text: "hello" }]);

        await mem2.close();

        // Restore memory for afterEach
        memory = await create(ctx);
        await memory.initialize();
      });

      it("initialize is idempotent — does not wipe existing data", async () => {
        await memory.createThread("t1", "Survives Init");
        await memory.addMessage("t1", {
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "still here" }],
        });

        // Call initialize again on the same instance
        await memory.initialize();

        const thread = await memory.getThread("t1");
        expect(thread).not.toBeNull();
        expect(thread?.title).toBe("Survives Init");

        const msgs = await memory.getMessages("t1");
        expect(msgs).toHaveLength(1);
        expect(msgs[0].id).toBe("m1");
      });

      it("message ordering survives reconnect", async () => {
        await memory.createThread("t1");
        await memory.addMessage("t1", {
          id: "m1",
          role: "user",
          parts: [{ type: "text", text: "first" }],
        });
        await memory.addMessage("t1", {
          id: "m2",
          role: "assistant",
          parts: [{ type: "text", text: "second" }],
        });
        await memory.close();

        // Reconnect and add more messages
        const mem2 = await create(ctx);
        await mem2.initialize();
        await mem2.addMessage("t1", {
          id: "m3",
          role: "user",
          parts: [{ type: "text", text: "third" }],
        });

        const msgs = await mem2.getMessages("t1");
        expect(msgs).toHaveLength(3);
        expect(msgs[0].id).toBe("m1");
        expect(msgs[1].id).toBe("m2");
        expect(msgs[2].id).toBe("m3");

        await mem2.close();

        // Restore memory for afterEach
        memory = await create(ctx);
        await memory.initialize();
      });
    });
  });
}
