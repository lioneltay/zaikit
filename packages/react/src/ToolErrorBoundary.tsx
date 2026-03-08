import React from "react";

export type ToolErrorFallbackProps = {
  toolName: string;
  toolCallId: string;
  error: Error;
};

type Props = {
  toolName: string;
  toolCallId: string;
  fallback?: React.ComponentType<ToolErrorFallbackProps> | null;
  children: React.ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Error boundary that wraps individual tool renderers. Prevents a single
 * broken tool from crashing the entire chat UI.
 *
 * By default, renders nothing on error and logs to console. Pass a `fallback`
 * component to render custom error UI.
 */
export class ToolErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(
      `[zaikit] Tool renderer "${this.props.toolName}" threw an error:`,
      error,
      info.componentStack,
    );
  }

  render() {
    if (this.state.error) {
      const Fallback = this.props.fallback;
      if (Fallback) {
        return (
          <Fallback
            toolName={this.props.toolName}
            toolCallId={this.props.toolCallId}
            error={this.state.error}
          />
        );
      }
      return null;
    }
    return this.props.children;
  }
}
