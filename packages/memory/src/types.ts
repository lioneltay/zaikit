import type { UIMessage } from "ai";

export type Thread = {
  id: string;
  title: string | null;
  ownerId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type GetMessagesOptions = {
  /** Return the most recent N messages. Omit for all messages. */
  limit?: number;
};

export type Memory = {
  /** Create tables/indexes. Safe to call multiple times (idempotent). */
  initialize(): Promise<void>;
  /** Close connections and release resources. */
  close(): Promise<void>;

  createThread(id: string, title?: string, ownerId?: string): Promise<Thread>;
  getThread(id: string): Promise<Thread | null>;
  listThreads(opts?: { ownerId?: string }): Promise<Thread[]>;
  deleteThread(id: string): Promise<void>;
  updateThread(
    id: string,
    updates: { title?: string; ownerId?: string },
  ): Promise<Thread>;

  getMessages(
    threadId: string,
    options?: GetMessagesOptions,
  ): Promise<UIMessage[]>;
  addMessage(threadId: string, message: UIMessage): Promise<void>;
  updateMessage(
    threadId: string,
    messageId: string,
    updates: { parts: UIMessage["parts"] },
  ): Promise<void>;
};
