import type { Memory } from "@zaikit/memory";
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
        owner_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_zaikit_threads_owner_id ON zaikit_threads(owner_id)
    `;
    await sql`
      CREATE TABLE IF NOT EXISTS zaikit_messages (
        id TEXT PRIMARY KEY,
        thread_id TEXT NOT NULL REFERENCES zaikit_threads(id) ON DELETE CASCADE,
        role TEXT NOT NULL,
        parts JSONB NOT NULL DEFAULT '[]',
        metadata JSONB,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        seq BIGSERIAL
      )
    `;
    // Add seq column to existing tables (idempotent migration)
    await sql`
      ALTER TABLE zaikit_messages ADD COLUMN IF NOT EXISTS seq BIGSERIAL
    `;
    // Replace old created_at index with seq-based index for deterministic ordering
    await sql`
      DROP INDEX IF EXISTS idx_zaikit_messages_thread_id
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_zaikit_messages_thread_seq ON zaikit_messages(thread_id, seq)
    `;
  }

  const memory: Memory = {
    initialize,
    async close() {
      await sql.end();
    },

    async createThread(id, title, ownerId) {
      const [row] = await sql`
        INSERT INTO zaikit_threads (id, title, owner_id)
        VALUES (${id}, ${title ?? null}, ${ownerId ?? null})
        RETURNING id, title, owner_id, created_at, updated_at
      `;
      return {
        id: row.id,
        title: row.title,
        ownerId: row.owner_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    async getThread(id) {
      const [row] = await sql`
        SELECT id, title, owner_id, created_at, updated_at FROM zaikit_threads WHERE id = ${id}
      `;
      if (!row) return null;
      return {
        id: row.id,
        title: row.title,
        ownerId: row.owner_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    async listThreads(opts) {
      const rows = opts?.ownerId
        ? await sql`
            SELECT id, title, owner_id, created_at, updated_at FROM zaikit_threads
            WHERE owner_id = ${opts.ownerId}
            ORDER BY updated_at DESC
          `
        : await sql`
            SELECT id, title, owner_id, created_at, updated_at FROM zaikit_threads ORDER BY updated_at DESC
          `;
      return rows.map((row) => ({
        id: row.id,
        title: row.title,
        ownerId: row.owner_id,
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
        SET
          title = COALESCE(${updates.title ?? null}, title),
          owner_id = COALESCE(${updates.ownerId ?? null}, owner_id),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, title, owner_id, created_at, updated_at
      `;
      if (!row) throw new Error(`Thread not found: ${id}`);
      return {
        id: row.id,
        title: row.title,
        ownerId: row.owner_id,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      };
    },

    async getMessages(threadId, options) {
      const limit = options?.limit;
      const rows =
        limit != null
          ? await sql`
              SELECT id, role, parts, metadata FROM (
                SELECT id, role, parts, metadata, seq FROM zaikit_messages
                WHERE thread_id = ${threadId}
                ORDER BY seq DESC
                LIMIT ${limit}
              ) sub ORDER BY seq
            `
          : await sql`
              SELECT id, role, parts, metadata FROM zaikit_messages
              WHERE thread_id = ${threadId}
              ORDER BY seq
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

  return memory;
}
