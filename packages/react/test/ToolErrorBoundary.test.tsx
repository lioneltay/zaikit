import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ToolErrorBoundary,
  type ToolErrorFallbackProps,
} from "../src/ToolErrorBoundary";

// Suppress React error boundary noise in test output
const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

afterEach(() => {
  consoleError.mockClear();
});

function ThrowingChild({ message }: { message: string }): never {
  throw new Error(message);
}

describe("ToolErrorBoundary", () => {
  it("renders children when no error is thrown", () => {
    render(
      <ToolErrorBoundary toolName="test" toolCallId="tc_1">
        <div>hello</div>
      </ToolErrorBoundary>,
    );
    expect(screen.getByText("hello")).toBeDefined();
  });

  it("renders null by default when a child throws", () => {
    const { container } = render(
      <ToolErrorBoundary toolName="broken_tool" toolCallId="tc_2">
        <ThrowingChild message="boom" />
      </ToolErrorBoundary>,
    );
    expect(container.innerHTML).toBe("");
  });

  it("logs the error with the tool name", () => {
    render(
      <ToolErrorBoundary toolName="broken_tool" toolCallId="tc_3">
        <ThrowingChild message="boom" />
      </ToolErrorBoundary>,
    );
    expect(consoleError).toHaveBeenCalledWith(
      expect.stringContaining("broken_tool"),
      expect.any(Error),
      expect.anything(),
    );
  });

  it("renders custom fallback with correct props", () => {
    function Fallback({ toolName, toolCallId, error }: ToolErrorFallbackProps) {
      return (
        <div>
          Error in {toolName} ({toolCallId}): {error.message}
        </div>
      );
    }

    render(
      <ToolErrorBoundary
        toolName="my_tool"
        toolCallId="tc_4"
        fallback={Fallback}
      >
        <ThrowingChild message="something broke" />
      </ToolErrorBoundary>,
    );

    expect(
      screen.getByText("Error in my_tool (tc_4): something broke"),
    ).toBeDefined();
  });

  it("renders null when fallback is explicitly null", () => {
    const { container } = render(
      <ToolErrorBoundary toolName="tool" toolCallId="tc_5" fallback={null}>
        <ThrowingChild message="fail" />
      </ToolErrorBoundary>,
    );
    expect(container.innerHTML).toBe("");
  });
});
