import { useEffect, useRef } from "react";
import { useAgent } from "./useAgent.js";
import type { ToolRenderFn } from "./types.js";

export function useToolRenderer(toolName: string, render: ToolRenderFn): void {
  const { registerToolRenderer } = useAgent();
  const renderRef = useRef(render);
  renderRef.current = render;

  useEffect(() => {
    const stableRender: ToolRenderFn = (props) => renderRef.current(props);
    return registerToolRenderer({ toolName, render: stableRender });
  }, [toolName, registerToolRenderer]);
}
