export { DevTools, type DevToolsProps } from "./DevToolsPanel";

export type ToolSchema = {
  description?: string;
  input?: Record<string, unknown>;
  suspend?: Record<string, unknown>;
  resume?: Record<string, unknown>;
};
