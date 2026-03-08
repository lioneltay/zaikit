import { describe, expect, it } from "vitest";
import { buildTelemetry } from "../src/telemetry";

describe("buildTelemetry", () => {
  // --- Returns undefined when no telemetry is configured ---

  it("returns undefined when neither defaults nor overrides are provided", () => {
    expect(buildTelemetry({})).toBeUndefined();
  });

  it("returns undefined when both are explicitly undefined", () => {
    expect(
      buildTelemetry({ defaults: undefined, overrides: undefined }),
    ).toBeUndefined();
  });

  // --- Defaults only (no overrides) ---

  it("returns defaults unchanged when no overrides", () => {
    const defaults = { isEnabled: true, functionId: "my-agent" };
    const result = buildTelemetry({ defaults });
    expect(result).toMatchObject({ isEnabled: true, functionId: "my-agent" });
  });

  // --- Overrides only (no defaults) ---

  it("uses overrides with isEnabled:false base when no defaults", () => {
    const result = buildTelemetry({
      overrides: { isEnabled: true, functionId: "override-fn" },
    });
    expect(result).toMatchObject({
      isEnabled: true,
      functionId: "override-fn",
    });
  });

  // --- Boolean shorthand ---

  it("overrides: true resolves to { isEnabled: true }", () => {
    const defaults = { isEnabled: false, functionId: "my-agent" };
    const result = buildTelemetry({ defaults, overrides: true });
    expect(result).toMatchObject({
      isEnabled: true,
      functionId: "my-agent",
    });
  });

  it("overrides: false resolves to { isEnabled: false }", () => {
    const defaults = { isEnabled: true, functionId: "my-agent" };
    const result = buildTelemetry({ defaults, overrides: false });
    expect(result).toMatchObject({
      isEnabled: false,
      functionId: "my-agent",
    });
  });

  it("overrides: true with no defaults creates enabled settings", () => {
    const result = buildTelemetry({ overrides: true });
    expect(result).toMatchObject({ isEnabled: true });
  });

  it("overrides: false with no defaults creates disabled settings", () => {
    const result = buildTelemetry({ overrides: false });
    expect(result).toMatchObject({ isEnabled: false });
  });

  // --- Merge semantics ---

  it("overrides take precedence over defaults for top-level fields", () => {
    const result = buildTelemetry({
      defaults: { isEnabled: true, functionId: "agent" },
      overrides: { functionId: "override" },
    });
    expect(result).toMatchObject({
      isEnabled: true,
      functionId: "override",
    });
  });

  it("merges metadata from both defaults and overrides", () => {
    const result = buildTelemetry({
      defaults: {
        isEnabled: true,
        metadata: { sessionId: "s1", custom: "from-defaults" },
      },
      overrides: {
        metadata: { userId: "u1", custom: "from-overrides" },
      },
    });
    expect(result?.metadata).toMatchObject({
      sessionId: "s1",
      userId: "u1",
      custom: "from-overrides", // overrides win
    });
  });

  it("override metadata replaces default metadata values on collision", () => {
    const result = buildTelemetry({
      defaults: { isEnabled: true, metadata: { sessionId: "default-session" } },
      overrides: { metadata: { sessionId: "override-session" } },
    });
    expect(result?.metadata).toMatchObject({
      sessionId: "override-session",
    });
  });

  // --- Auto-enrichment: sessionId ---

  it("auto-injects threadId as sessionId when not present", () => {
    const result = buildTelemetry({
      defaults: { isEnabled: true },
      threadId: "thread-123",
    });
    expect(result?.metadata).toMatchObject({ sessionId: "thread-123" });
  });

  it("does not overwrite user-provided sessionId", () => {
    const result = buildTelemetry({
      defaults: {
        isEnabled: true,
        metadata: { sessionId: "user-provided" },
      },
      threadId: "thread-123",
    });
    expect(result?.metadata).toMatchObject({ sessionId: "user-provided" });
  });

  it("does not inject sessionId when threadId is empty", () => {
    const result = buildTelemetry({
      defaults: { isEnabled: true },
      threadId: "",
    });
    expect(result?.metadata).not.toHaveProperty("sessionId");
  });

  // --- Auto-enrichment: userId ---

  it("auto-injects userId when not present", () => {
    const result = buildTelemetry({
      defaults: { isEnabled: true },
      userId: "user-456",
    });
    expect(result?.metadata).toMatchObject({ userId: "user-456" });
  });

  it("does not overwrite user-provided userId", () => {
    const result = buildTelemetry({
      defaults: {
        isEnabled: true,
        metadata: { userId: "user-provided" },
      },
      userId: "user-456",
    });
    expect(result?.metadata).toMatchObject({ userId: "user-provided" });
  });

  it("does not inject userId when userId is empty", () => {
    const result = buildTelemetry({
      defaults: { isEnabled: true },
      userId: "",
    });
    expect(result?.metadata).not.toHaveProperty("userId");
  });

  // --- Auto-enrichment: tags ---

  it("prepends agentName to tags", () => {
    const result = buildTelemetry({
      defaults: { isEnabled: true },
      agentName: "my-agent",
    });
    expect(result?.metadata).toMatchObject({ tags: ["my-agent"] });
  });

  it("prepends agentName to existing tags", () => {
    const result = buildTelemetry({
      defaults: {
        isEnabled: true,
        metadata: { tags: ["existing-tag", "another"] },
      },
      agentName: "my-agent",
    });
    const tags = (result?.metadata as Record<string, unknown>)?.tags;
    expect(tags).toEqual(["my-agent", "existing-tag", "another"]);
  });

  it("does not add tags when agentName is not provided", () => {
    const result = buildTelemetry({
      defaults: { isEnabled: true },
    });
    expect(result?.metadata).not.toHaveProperty("tags");
  });

  it("replaces non-array tags with agentName", () => {
    const result = buildTelemetry({
      defaults: {
        isEnabled: true,
        metadata: { tags: "not-an-array" as any },
      },
      agentName: "my-agent",
    });
    const tags = (result?.metadata as Record<string, unknown>)?.tags;
    expect(tags).toEqual(["my-agent"]);
  });

  // --- Boolean override + enrichment ---

  it("overrides: true combined with enrichment fields", () => {
    const result = buildTelemetry({
      defaults: { isEnabled: false, functionId: "agent" },
      overrides: true,
      threadId: "t1",
      userId: "u1",
      agentName: "my-agent",
    });
    expect(result).toMatchObject({
      isEnabled: true,
      functionId: "agent",
      metadata: {
        sessionId: "t1",
        userId: "u1",
        tags: ["my-agent"],
      },
    });
  });

  // --- Combined enrichment ---

  it("enriches with all fields simultaneously", () => {
    const result = buildTelemetry({
      defaults: { isEnabled: true, functionId: "agent" },
      agentName: "my-agent",
      threadId: "thread-1",
      userId: "user-1",
    });
    expect(result).toMatchObject({
      isEnabled: true,
      functionId: "agent",
      metadata: {
        sessionId: "thread-1",
        userId: "user-1",
        tags: ["my-agent"],
      },
    });
  });

  it("full merge with overrides and enrichment", () => {
    const result = buildTelemetry({
      defaults: {
        isEnabled: true,
        functionId: "agent",
        metadata: { custom: "value" },
      },
      overrides: {
        functionId: "agent-title-generation",
      },
      agentName: "my-agent",
      threadId: "thread-1",
      userId: "user-1",
    });
    expect(result).toMatchObject({
      isEnabled: true,
      functionId: "agent-title-generation",
      metadata: {
        custom: "value",
        sessionId: "thread-1",
        userId: "user-1",
        tags: ["my-agent"],
      },
    });
  });

  // --- Does not mutate inputs ---

  it("does not mutate the defaults object", () => {
    const defaults = {
      isEnabled: true,
      metadata: { existing: "value" },
    };
    const original = JSON.parse(JSON.stringify(defaults));
    buildTelemetry({
      defaults,
      overrides: { metadata: { added: "new" } },
      agentName: "agent",
      threadId: "t1",
      userId: "u1",
    });
    expect(defaults).toEqual(original);
  });

  it("does not mutate the overrides object", () => {
    const overrides = {
      isEnabled: true,
      metadata: { custom: "val" },
    };
    const original = JSON.parse(JSON.stringify(overrides));
    buildTelemetry({
      defaults: { isEnabled: false },
      overrides,
      agentName: "agent",
    });
    expect(overrides).toEqual(original);
  });
});
