import type { Memory, Thread } from "@zaikit/memory";
import type { UIMessage } from "ai";

export function createInMemoryMemory(): Memory {
  const threads = new Map<string, Thread>();
  const messages = new Map<string, UIMessage[]>();

  return {
    async initialize() {},
    async close() {},

    async createThread(id, title, userId) {
      const now = new Date();
      const thread: Thread = {
        id,
        title: title ?? null,
        userId: userId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      threads.set(id, thread);
      messages.set(id, []);
      return thread;
    },

    async getThread(id) {
      return threads.get(id) ?? null;
    },

    async listThreads(opts) {
      let result = Array.from(threads.values());
      if (opts?.userId) {
        result = result.filter((t) => t.userId === opts.userId);
      }
      // Sort by updatedAt descending (newest first), matching postgres behavior
      result.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
      return result;
    },

    async deleteThread(id) {
      threads.delete(id);
      messages.delete(id);
    },

    async updateThread(id, updates) {
      const thread = threads.get(id);
      if (!thread) throw new Error(`Thread not found: ${id}`);
      const updated: Thread = {
        ...thread,
        ...(updates.title !== undefined ? { title: updates.title } : {}),
        ...(updates.userId !== undefined ? { userId: updates.userId } : {}),
        updatedAt: new Date(),
      };
      threads.set(id, updated);
      return updated;
    },

    async getMessages(threadId, options) {
      const all = messages.get(threadId) ?? [];
      if (options?.limit != null) {
        return all.slice(-options.limit);
      }
      return all;
    },

    async addMessage(threadId, message) {
      const threadMsgs = messages.get(threadId);
      if (!threadMsgs) {
        messages.set(threadId, [message]);
      } else {
        // Upsert: if message with same id exists, replace it
        const idx = threadMsgs.findIndex((m) => m.id === message.id);
        if (idx >= 0) {
          threadMsgs[idx] = message;
        } else {
          threadMsgs.push(message);
        }
      }
      // Update thread's updatedAt
      const thread = threads.get(threadId);
      if (thread) {
        thread.updatedAt = new Date();
      }
    },

    async updateMessage(threadId, messageId, updates) {
      const threadMsgs = messages.get(threadId);
      if (!threadMsgs) return;
      const msg = threadMsgs.find((m) => m.id === messageId);
      if (msg) {
        if (updates.parts !== undefined) msg.parts = updates.parts;
        if (updates.metadata !== undefined) msg.metadata = updates.metadata;
      }
      // Update thread's updatedAt
      const thread = threads.get(threadId);
      if (thread) {
        thread.updatedAt = new Date();
      }
    },
  };
}
