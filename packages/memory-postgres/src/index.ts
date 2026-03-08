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

  function toThread(row: Record<string, any>) {
    return {
      id: row.id as string,
      title: row.title as string | null,
      userId: row.user_id as string | null,
      createdAt: row.created_at as Date,
      updatedAt: row.updated_at as Date,
    };
  }

  async function initialize() {
    await sql`
      CREATE TABLE IF NOT EXISTS zaikit_threads (
        id TEXT PRIMARY KEY,
        title TEXT,
        user_id TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `;
    await sql`
      CREATE INDEX IF NOT EXISTS idx_zaikit_threads_user_id ON zaikit_threads(user_id)
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
    await sql`
      CREATE INDEX IF NOT EXISTS idx_zaikit_messages_thread_seq ON zaikit_messages(thread_id, seq)
    `;
  }

  const memory: Memory = {
    initialize,
    async close() {
      await sql.end();
    },

    async createThread(id, title, userId) {
      const [row] = await sql`
        INSERT INTO zaikit_threads (id, title, user_id)
        VALUES (${id}, ${title ?? null}, ${userId ?? null})
        RETURNING id, title, user_id, created_at, updated_at
      `;
      return toThread(row);
    },

    async getThread(id) {
      const [row] = await sql`
        SELECT id, title, user_id, created_at, updated_at FROM zaikit_threads WHERE id = ${id}
      `;
      if (!row) return null;
      return toThread(row);
    },

    async listThreads(opts) {
      const rows = opts?.userId
        ? await sql`
            SELECT id, title, user_id, created_at, updated_at FROM zaikit_threads
            WHERE user_id = ${opts.userId}
            ORDER BY updated_at DESC
          `
        : await sql`
            SELECT id, title, user_id, created_at, updated_at FROM zaikit_threads ORDER BY updated_at DESC
          `;
      return rows.map(toThread);
    },

    async deleteThread(id) {
      await sql`DELETE FROM zaikit_threads WHERE id = ${id}`;
    },

    async updateThread(id, updates) {
      const [row] = await sql`
        UPDATE zaikit_threads
        SET
          title = COALESCE(${updates.title ?? null}, title),
          user_id = COALESCE(${updates.userId ?? null}, user_id),
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, title, user_id, created_at, updated_at
      `;
      if (!row) throw new Error(`Thread not found: ${id}`);
      return toThread(row);
    },

    async getMessages(threadId, options) {
      const limit = options?.limit;
      const before = options?.before;

      let cursorSeq: number | null = null;
      if (before != null) {
        const [cursorRow] = await sql`
          SELECT seq FROM zaikit_messages
          WHERE id = ${before} AND thread_id = ${threadId}
        `;
        if (!cursorRow) return [];
        cursorSeq = cursorRow.seq as number;
      }

      let rows: postgres.RowList<postgres.Row[]>;
      if (cursorSeq != null && limit != null) {
        rows = await sql`
          SELECT id, role, parts, metadata FROM (
            SELECT id, role, parts, metadata, seq FROM zaikit_messages
            WHERE thread_id = ${threadId} AND seq < ${cursorSeq}
            ORDER BY seq DESC
            LIMIT ${limit}
          ) sub ORDER BY seq
        `;
      } else if (cursorSeq != null) {
        rows = await sql`
          SELECT id, role, parts, metadata FROM zaikit_messages
          WHERE thread_id = ${threadId} AND seq < ${cursorSeq}
          ORDER BY seq
        `;
      } else if (limit != null) {
        rows = await sql`
          SELECT id, role, parts, metadata FROM (
            SELECT id, role, parts, metadata, seq FROM zaikit_messages
            WHERE thread_id = ${threadId}
            ORDER BY seq DESC
            LIMIT ${limit}
          ) sub ORDER BY seq
        `;
      } else {
        rows = await sql`
          SELECT id, role, parts, metadata FROM zaikit_messages
          WHERE thread_id = ${threadId}
          ORDER BY seq
        `;
      }

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
      const sets: ReturnType<typeof sql>[] = [];
      if (updates.parts !== undefined) {
        sets.push(sql`parts = ${sql.json(updates.parts as any)}`);
      }
      if (updates.metadata !== undefined) {
        sets.push(sql`metadata = ${sql.json(updates.metadata as any)}`);
      }
      if (sets.length > 0) {
        const setClause = sets.reduce((a, b) => sql`${a}, ${b}`);
        await sql`
          UPDATE zaikit_messages
          SET ${setClause}
          WHERE id = ${messageId} AND thread_id = ${threadId}
        `;
      }
      await sql`
        UPDATE zaikit_threads SET updated_at = NOW() WHERE id = ${threadId}
      `;
    },
  };

  return memory;
}
