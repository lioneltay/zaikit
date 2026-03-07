import type { Memory } from "@zaikit/memory";
import type { UIMessage } from "ai";
import { MongoClient } from "mongodb";

type MongoMemoryOptions = {
  url: string;
  dbName?: string;
};

type ThreadDoc = {
  _id: string;
  title: string | null;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MessageDoc = {
  messageId: string;
  threadId: string;
  role: string;
  parts: UIMessage["parts"];
  metadata: UIMessage["metadata"] | null;
  seq: number;
};

type CounterDoc = {
  _id: string;
  seq: number;
};

export function createMongoMemory({
  url,
  dbName = "zaikit",
}: MongoMemoryOptions) {
  const client = new MongoClient(url);
  const db = client.db(dbName);

  const threads = db.collection<ThreadDoc>("zaikit_threads");
  const messages = db.collection<MessageDoc>("zaikit_messages");
  const counters = db.collection<CounterDoc>("zaikit_counters");

  async function initialize() {
    await threads.createIndex({ ownerId: 1 });
    await messages.createIndex({ messageId: 1, threadId: 1 }, { unique: true });
    await messages.createIndex({ threadId: 1, seq: 1 });
  }

  async function nextSeq(threadId: string): Promise<number> {
    const result = await counters.findOneAndUpdate(
      { _id: threadId },
      { $inc: { seq: 1 } },
      { upsert: true, returnDocument: "after" },
    );
    return result?.seq ?? 0;
  }

  function toThread(doc: ThreadDoc) {
    return {
      id: doc._id,
      title: doc.title,
      ownerId: doc.ownerId,
      createdAt: doc.createdAt,
      updatedAt: doc.updatedAt,
    };
  }

  const memory: Memory = {
    initialize,
    async close() {
      await client.close();
    },
    async clear() {
      await messages.deleteMany({});
      await threads.deleteMany({});
      await counters.deleteMany({});
    },

    async createThread(id, title, ownerId) {
      const now = new Date();
      const doc: ThreadDoc = {
        _id: id,
        title: title ?? null,
        ownerId: ownerId ?? null,
        createdAt: now,
        updatedAt: now,
      };
      await threads.insertOne(doc);
      return toThread(doc);
    },

    async getThread(id) {
      const doc = await threads.findOne({ _id: id });
      if (!doc) return null;
      return toThread(doc);
    },

    async listThreads(opts) {
      const filter = opts?.ownerId ? { ownerId: opts.ownerId } : {};
      const docs = await threads.find(filter).sort({ updatedAt: -1 }).toArray();
      return docs.map(toThread);
    },

    async deleteThread(id) {
      await messages.deleteMany({ threadId: id });
      await counters.deleteOne({ _id: id });
      await threads.deleteOne({ _id: id });
    },

    async updateThread(id, updates) {
      const $set: Record<string, unknown> = { updatedAt: new Date() };
      if (updates.title !== undefined) $set.title = updates.title;
      if (updates.ownerId !== undefined) $set.ownerId = updates.ownerId;

      const result = await threads.findOneAndUpdate(
        { _id: id },
        { $set },
        { returnDocument: "after" },
      );
      if (!result) throw new Error(`Thread not found: ${id}`);
      return toThread(result);
    },

    async getMessages(threadId, options) {
      const limit = options?.limit;
      const docs =
        limit != null
          ? (
              await messages
                .find({ threadId })
                .sort({ seq: -1 })
                .limit(limit)
                .toArray()
            ).reverse()
          : await messages.find({ threadId }).sort({ seq: 1 }).toArray();
      return docs.map(
        (doc): UIMessage => ({
          id: doc.messageId,
          role: doc.role as UIMessage["role"],
          parts: doc.parts,
          ...(doc.metadata ? { metadata: doc.metadata } : {}),
        }),
      );
    },

    async addMessage(threadId, message) {
      const seq = await nextSeq(threadId);
      await messages.updateOne(
        { messageId: message.id, threadId },
        {
          $set: {
            role: message.role,
            parts: message.parts,
            metadata: message.metadata ?? null,
          },
          $setOnInsert: { seq },
        },
        { upsert: true },
      );
      await threads.updateOne(
        { _id: threadId },
        { $set: { updatedAt: new Date() } },
      );
    },

    async updateMessage(threadId, messageId, updates) {
      await messages.updateOne(
        { messageId, threadId },
        { $set: { parts: updates.parts } },
      );
      await threads.updateOne(
        { _id: threadId },
        { $set: { updatedAt: new Date() } },
      );
    },
  };

  return memory;
}
