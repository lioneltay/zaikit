import type { Memory } from "@zaikit/core";
import type { UIMessage } from "ai";
import postgres from "postgres";

type PostgresMemoryOptions = {
  connectionString: string;
};

export function createPostgresMemory({
  connectionString,
}: PostgresMemoryOptions) {
  const sql = postgres(connectionString);

  async function initialize() {
    await sql`
      CREATE TABLE IF NOT EXISTS zaikit_threads (
        id TEXT PRIMARY KEY,
        title TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS zaikit_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES zaikit_threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        parts JSONB NOT NULL DEFAULT '[]',
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_zaikit_messages_thread_id ON zaikit_messages(thread_id, created_at)
    `;
  }

  const memory: Memory = {
    async createThread(id, title) {
      const [row] = await sql`
        INSERT INTO zaikit_threads (id, title)
        VALUES (${id}, ${title ?? null})
        RETURNING id, title, created_at, updated_at
      `;
      return {
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    async getThread(id) {
      const [row] = await sql`
        SELECT id, title, created_at, updated_at FROM zaikit_threads WHERE id = ${id}
      `;
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    async listThreads() {
      const rows = await sql`
        SELECT id, title, created_at, updated_at FROM zaikit_threads ORDER BY updated_at DESC
      `;
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      }));
    },

    async deleteThread(id) {
      await sql`DELETE FROM zaikit_threads WHERE id = ${id}`;
    },

    async updateThread(id, updates) {
      const [row] = await sql`
        UPDATE zaikit_threads
        SET title = COALESCE(${updates.title ?? null}, title), updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, title, created_at, updated_at
      `;
      if (!row) throw new Error(`Thread not found: ${id}`);
      return {
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    async getMessages(threadId) {
      const rows = await sql`
        SELECT id, role, parts, metadata FROM zaikit_messages
        WHERE thread_id = ${threadId}
        ORDER BY created_at
      `;
      return rows.map(
        (row): UIMessage => ({
          id: row.id,
          role: row.role,
          parts: row.parts,
          ...(row.metadata ? { metadata: row.metadata } : {}),
        }),
      );
    },

    async addMessage(threadId, message) {
      await sql`
        INSERT INTO zaikit_messages (id, thread_id, role, parts, metadata)
        VALUES (
          ${message.id},
          ${threadId},
          ${message.role},
          ${sql.json(message.parts as any)},
          ${message.metadata ? sql.json(message.metadata as any) : null}
        )
        ON CONFLICT (id) DO UPDATE SET
          parts = ${sql.json(message.parts as any)},
          metadata = ${message.metadata ? sql.json(message.metadata as any) : null}
      `;
      await sql`
        UPDATE zaikit_threads SET updated_at = NOW() WHERE id = ${threadId}
      `;
    },

    async updateMessage(threadId, messageId, updates) {
      await sql`
        UPDATE zaikit_messages
        SET parts = ${sql.json(updates.parts as any)}
        WHERE id = ${messageId} AND thread_id = ${threadId}
      `;
      await sql`
        UPDATE zaikit_threads SET updated_at = NOW() WHERE id = ${threadId}
      `;
    },
  };

  return { ...memory, initialize };
}
