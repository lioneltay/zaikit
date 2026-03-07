import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import type { Memory } from "../types";

type MemoryConformanceOptions = {
  setup: () => Memory | Promise<Memory>;
};

export function memoryConformanceTests({ setup }: MemoryConformanceOptions) {
  describe("Memory conformance", () => {
    describe("threads", () => {
      it("creates a thread and retrieves it", async () => {
        const memory = await setup();
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
        const memory = await setup();
        const thread = await memory.createThread("t1");

        expect(thread.title).toBeNull();
        expect(thread.ownerId).toBeNull();
      });

      it("returns null for nonexistent thread", async () => {
        const memory = await setup();
        const thread = await memory.getThread("nonexistent");
        expect(thread).toBeNull();
      });

      it("lists threads ordered by updatedAt descending", async () => {
        const memory = await setup();
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
        const memory = await setup();
        await memory.createThread("t1", "A", "user-1");
        await memory.createThread("t2", "B", "user-2");
        await memory.createThread("t3", "C", "user-1");

        const threads = await memory.listThreads({ ownerId: "user-1" });
        expect(threads).toHaveLength(2);
        expect(threads.every((t) => t.ownerId === "user-1")).toBe(true);
      });

      it("updates thread title", async () => {
        const memory = await setup();
        await memory.createThread("t1", "Old Title");

        const updated = await memory.updateThread("t1", {
          title: "New Title",
        });
        expect(updated.title).toBe("New Title");

        const retrieved = await memory.getThread("t1");
        expect(retrieved?.title).toBe("New Title");
      });

      it("updates thread ownerId", async () => {
        const memory = await setup();
        await memory.createThread("t1", "Thread", "user-1");

        const updated = await memory.updateThread("t1", {
          ownerId: "user-2",
        });
        expect(updated.ownerId).toBe("user-2");
      });

      it("throws when updating nonexistent thread", async () => {
        const memory = await setup();
        await expect(
          memory.updateThread("nonexistent", { title: "X" }),
        ).rejects.toThrow();
      });

      it("deletes a thread", async () => {
        const memory = await setup();
        await memory.createThread("t1", "Thread");
        await memory.deleteThread("t1");

        const thread = await memory.getThread("t1");
        expect(thread).toBeNull();
      });

      it("cascade deletes messages when thread is deleted", async () => {
        const memory = await setup();
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
        const memory = await setup();
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
        const memory = await setup();
        await memory.createThread("t1");
        const msgs = await memory.getMessages("t1");
        expect(msgs).toHaveLength(0);
      });

      it("returns empty array for nonexistent thread", async () => {
        const memory = await setup();
        const msgs = await memory.getMessages("nonexistent");
        expect(msgs).toHaveLength(0);
      });

      it("upserts message with same id", async () => {
        const memory = await setup();
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
        const memory = await setup();
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
        const memory = await setup();
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
        const memory = await setup();
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
        const memory = await setup();
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
  });
}
