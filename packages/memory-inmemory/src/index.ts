import type { Memory, Thread } from "@zaikit/memory";
import type { UIMessage } from "ai";

export function createInMemoryMemory(): Memory {
  const threads = new Map<string, Thread>();
  const messages = new Map<string, UIMessage[]>();

  return {
    async initialize() {},
    async close() {},

    async createThread(id, title, ownerId) {
      const now = new Date();
      const thread: Thread = {
        id,
        title: title ?? null,
        ownerId: ownerId ?? null,
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
      if (opts?.ownerId) {
        result = result.filter((t) => t.ownerId === opts.ownerId);
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
        ...(updates.ownerId !== undefined ? { ownerId: updates.ownerId } : {}),
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
        msg.parts = updates.parts;
      }
      // Update thread's updatedAt
      const thread = threads.get(threadId);
      if (thread) {
        thread.updatedAt = new Date();
      }
    },
  };
}
