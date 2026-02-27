import type { UIMessage } from "ai";

export type Thread = {
  id: string;
  title: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type Memory = {
  createThread(id: string, title?: string): Promise<Thread>;
  getThread(id: string): Promise<Thread | null>;
  listThreads(): Promise<Thread[]>;
  deleteThread(id: string): Promise<void>;

  getMessages(threadId: string): Promise<UIMessage[]>;
  addMessage(threadId: string, message: UIMessage): Promise<void>;
};
