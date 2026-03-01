import { useEffect, useRef } from "react";
import type { ToolRenderFn } from "./types";
import { useAgent } from "./useAgent";

export function useToolRenderer(toolName: string, render: ToolRenderFn): void {
  const { registerToolRenderer } = useAgent();
  const renderRef = useRef(render);
  renderRef.current = render;

  useEffect(() => {
    const stableRender: ToolRenderFn = (props) => renderRef.current(props);
    return registerToolRenderer({ toolName, render: stableRender });
  }, [toolName, registerToolRenderer]);
}
