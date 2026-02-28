import { useContext } from "react";
import { AgentContext } from "./AgentProvider.js";
import type { AgentContextValue } from "./types.js";

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) {
    throw new Error("useAgent must be used within an <AgentProvider>");
  }
  return ctx;
}
