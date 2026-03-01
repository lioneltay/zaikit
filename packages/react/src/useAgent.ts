import { useContext } from "react";
import { AgentContext } from "./AgentProvider";
import type { AgentContextValue } from "./types";

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) {
    throw new Error("useAgent must be used within an <AgentProvider>");
  }
  return ctx;
}
