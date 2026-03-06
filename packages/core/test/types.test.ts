/**
 * Type-level tests for @zaikit/core.
 *
 * These tests use vitest's `expectTypeOf` to assert type relationships.
 * They are checked at type-check time (`tsc --noEmit` / `pnpm check-types`)
 * and catch type regressions without requiring runtime execution.
 *
 * The runtime test suite (`vitest run`) also executes these — the
 * `expectTypeOf` assertions are runtime no-ops (always pass), but
 * `@ts-expect-error` annotations are enforced by `tsc`.
 */

import { describe, expectTypeOf, it } from "vitest";
import { z } from "zod";
import type {
  Agent,
  AgentResult,
  BaseGenerateOptions,
  ChatOptions,
  CreateAgentOptions,
  GenerateResult,
  MappedToolEntry,
  PrepareStep,
  ResolveToolEntry,
  ResolveToolsConfig,
  StreamOptions,
  StreamResult,
  ToolConfigValue,
  ToolDataEventFor,
  ValidateMappedTools,
} from "../src/agent-types";
import { createTool, type ZaikitTool } from "../src/create-tool";
import type { SuspendResult } from "../src/suspend";
import type {
  ToolDataEvent,
  WriteDataFn,
  WriteDataPart,
  WriteToolDataFn,
} from "../src/write-data";

// ─── Fixtures ───

const plainTool = createTool({
  description: "No data, no context, no suspend",
  inputSchema: z.object({ name: z.string() }),
  execute: async () => "done",
});

const contextTool = createTool({
  description: "With context",
  inputSchema: z.object({ query: z.string() }),
  context: z.object({ userId: z.string() }),
  execute: async ({ context }) => `hello ${context.userId}`,
});

const suspendTool = createTool({
  description: "Suspendable, no context",
  inputSchema: z.object({ prompt: z.string() }),
  suspendSchema: z.object({ question: z.string() }),
  resumeSchema: z.object({ answer: z.string() }),
  execute: async ({ suspend, resumeData, resumeHistory }) => {
    if (!resumeData) return suspend({ question: "ready?" });
    return `got: ${resumeData.answer}`;
  },
});

const suspendContextTool = createTool({
  description: "Suspendable with context",
  inputSchema: z.object({}),
  context: z.object({ locale: z.string() }),
  suspendSchema: z.object({ question: z.string() }),
  resumeSchema: z.object({ answer: z.string() }),
  execute: async ({ context, suspend, resumeData }) => {
    if (!resumeData) return suspend({ question: `[${context.locale}] ready?` });
    return "done";
  },
});

const dataTool = createTool({
  description: "With data schema",
  inputSchema: z.object({ service: z.string() }),
  dataSchema: {
    progress: z.object({ step: z.number(), total: z.number() }),
    status: z.object({ ok: z.boolean() }),
  },
  execute: async ({ writeToolData, writeData }) => {
    writeToolData("progress", { step: 1, total: 3 });
    writeToolData("status", { ok: true });
    writeData({ type: "untyped", data: "hello" });
    return "done";
  },
});

const dataContextTool = createTool({
  description: "Data + context",
  inputSchema: z.object({}),
  context: z.object({ orgId: z.string() }),
  dataSchema: {
    audit: z.object({ action: z.string() }),
  },
  execute: async ({ context, writeToolData }) => {
    writeToolData("audit", { action: `by ${context.orgId}` });
    return "done";
  },
});

const suspendDataTool = createTool({
  description: "Suspendable with data",
  inputSchema: z.object({}),
  suspendSchema: z.object({ question: z.string() }),
  resumeSchema: z.object({ answer: z.string() }),
  dataSchema: {
    log: z.object({ message: z.string() }),
  },
  execute: async ({ writeToolData, suspend, resumeData }) => {
    writeToolData("log", { message: "starting" });
    if (!resumeData) return suspend({ question: "ready?" });
    return "done";
  },
});

const fullTool = createTool({
  description: "All features: suspend + context + data",
  inputSchema: z.object({ cmd: z.string() }),
  context: z.object({ tenantId: z.string() }),
  suspendSchema: z.object({ approval: z.string() }),
  resumeSchema: z.object({ approved: z.boolean() }),
  dataSchema: {
    progress: z.object({ pct: z.number() }),
  },
  execute: async ({
    input,
    context,
    suspend,
    resumeData,
    resumeHistory,
    writeToolData,
    writeData,
  }) => {
    writeToolData("progress", { pct: 50 });
    writeData({ type: "msg", data: "hi" });
    if (!resumeData) return suspend({ approval: input.cmd });
    return `approved: ${resumeData.approved} for ${context.tenantId}`;
  },
});

// ────────────────────────────────────────────
// § 1. createTool — execute context types
// ────────────────────────────────────────────

describe("createTool — execute context", () => {
  it("plain tool: ctx has input + writeData, nothing else", () => {
    createTool({
      description: "test",
      inputSchema: z.object({ name: z.string() }),
      execute: async (ctx) => {
        // input is typed
        expectTypeOf(ctx.input).toEqualTypeOf<{ name: string }>();
        // writeData always present
        expectTypeOf(ctx.writeData).toEqualTypeOf<WriteDataFn>();

        // No context, suspend, resumeData, resumeHistory, writeToolData
        type Ctx = typeof ctx;
        expectTypeOf<
          "context" extends keyof Ctx ? true : false
        >().toEqualTypeOf<false>();
        expectTypeOf<
          "suspend" extends keyof Ctx ? true : false
        >().toEqualTypeOf<false>();
        expectTypeOf<
          "resumeData" extends keyof Ctx ? true : false
        >().toEqualTypeOf<false>();
        expectTypeOf<
          "resumeHistory" extends keyof Ctx ? true : false
        >().toEqualTypeOf<false>();
        expectTypeOf<
          "writeToolData" extends keyof Ctx ? true : false
        >().toEqualTypeOf<false>();

        return "done";
      },
    });
  });

  it("context tool: ctx has context typed", () => {
    createTool({
      description: "test",
      inputSchema: z.object({}),
      context: z.object({ userId: z.string() }),
      execute: async (ctx) => {
        expectTypeOf(ctx.context).toEqualTypeOf<{ userId: string }>();
        expectTypeOf(ctx.writeData).toEqualTypeOf<WriteDataFn>();

        type Ctx = typeof ctx;
        expectTypeOf<
          "suspend" extends keyof Ctx ? true : false
        >().toEqualTypeOf<false>();

        return "done";
      },
    });
  });

  it("suspendable tool: ctx has suspend, resumeData, resumeHistory", () => {
    createTool({
      description: "test",
      inputSchema: z.object({}),
      suspendSchema: z.object({ q: z.string() }),
      resumeSchema: z.object({ a: z.number() }),
      execute: async (ctx) => {
        expectTypeOf(ctx.suspend).toBeFunction();
        // suspend accepts SUSPEND and returns SuspendResult<SUSPEND>
        expectTypeOf(ctx.suspend).toEqualTypeOf<
          (data: { q: string }) => SuspendResult<{ q: string }>
        >();
        expectTypeOf(ctx.resumeData).toEqualTypeOf<{ a: number } | undefined>();
        expectTypeOf(ctx.resumeHistory).toEqualTypeOf<{ a: number }[]>();

        type Ctx = typeof ctx;
        expectTypeOf<
          "context" extends keyof Ctx ? true : false
        >().toEqualTypeOf<false>();

        if (!ctx.resumeData) return ctx.suspend({ q: "hello" });
        return "done";
      },
    });
  });

  it("suspendable + context: ctx has both", () => {
    createTool({
      description: "test",
      inputSchema: z.object({}),
      context: z.object({ locale: z.string() }),
      suspendSchema: z.object({ q: z.string() }),
      resumeSchema: z.object({ a: z.string() }),
      execute: async (ctx) => {
        expectTypeOf(ctx.context).toEqualTypeOf<{ locale: string }>();
        expectTypeOf(ctx.suspend).toBeFunction();
        expectTypeOf(ctx.resumeData).toEqualTypeOf<{ a: string } | undefined>();
        expectTypeOf(ctx.resumeHistory).toEqualTypeOf<{ a: string }[]>();

        if (!ctx.resumeData) return ctx.suspend({ q: "hi" });
        return "done";
      },
    });
  });

  it("data tool: ctx has writeToolData typed", () => {
    createTool({
      description: "test",
      inputSchema: z.object({}),
      dataSchema: {
        progress: z.object({ step: z.number() }),
        status: z.object({ ok: z.boolean() }),
      },
      execute: async (ctx) => {
        expectTypeOf(ctx).toHaveProperty("writeToolData");
        type WTD = typeof ctx.writeToolData;
        expectTypeOf<WTD>().toMatchTypeOf<
          WriteToolDataFn<{
            progress: { step: number };
            status: { ok: boolean };
          }>
        >();
        return "done";
      },
    });
  });

  it("data + context: ctx has both writeToolData and context", () => {
    createTool({
      description: "test",
      inputSchema: z.object({}),
      context: z.object({ orgId: z.string() }),
      dataSchema: {
        audit: z.object({ action: z.string() }),
      },
      execute: async (ctx) => {
        expectTypeOf(ctx.context).toEqualTypeOf<{ orgId: string }>();
        expectTypeOf(ctx).toHaveProperty("writeToolData");
        return "done";
      },
    });
  });

  it("full tool (suspend + context + data): ctx has ALL members", () => {
    createTool({
      description: "test",
      inputSchema: z.object({ cmd: z.string() }),
      context: z.object({ tenantId: z.string() }),
      suspendSchema: z.object({ approval: z.string() }),
      resumeSchema: z.object({ approved: z.boolean() }),
      dataSchema: {
        progress: z.object({ pct: z.number() }),
      },
      execute: async (ctx) => {
        expectTypeOf(ctx.input).toEqualTypeOf<{ cmd: string }>();
        expectTypeOf(ctx.context).toEqualTypeOf<{ tenantId: string }>();
        expectTypeOf(ctx.suspend).toBeFunction();
        expectTypeOf(ctx.resumeData).toEqualTypeOf<
          { approved: boolean } | undefined
        >();
        expectTypeOf(ctx.resumeHistory).toEqualTypeOf<
          { approved: boolean }[]
        >();
        expectTypeOf(ctx).toHaveProperty("writeToolData");
        expectTypeOf(ctx.writeData).toEqualTypeOf<WriteDataFn>();

        if (!ctx.resumeData) return ctx.suspend({ approval: "deploy" });
        return "done";
      },
    });
  });
});

// ────────────────────────────────────────────
// § 2. createTool — negative tests
// ────────────────────────────────────────────

describe("createTool — negative tests", () => {
  it("writeToolData rejects invalid type key", () => {
    createTool({
      description: "test",
      inputSchema: z.object({}),
      dataSchema: { progress: z.object({ step: z.number() }) },
      execute: async (ctx) => {
        ctx.writeToolData("progress", { step: 1 });
        // @ts-expect-error — "nonexistent" is not a valid key
        ctx.writeToolData("nonexistent", { step: 1 });
        return "done";
      },
    });
  });

  it("writeToolData rejects invalid data shape", () => {
    createTool({
      description: "test",
      inputSchema: z.object({}),
      dataSchema: { progress: z.object({ step: z.number() }) },
      execute: async (ctx) => {
        // @ts-expect-error — step should be number, not string
        ctx.writeToolData("progress", { step: "not-a-number" });
        return "done";
      },
    });
  });
});

// ────────────────────────────────────────────
// § 3. ZaikitTool.__toolTypes (phantom)
// ────────────────────────────────────────────

describe("ZaikitTool.__toolTypes — phantom types", () => {
  it("plain tool: defaults", () => {
    type T = typeof plainTool;
    type Types = T["__toolTypes"];
    expectTypeOf<Types["input"]>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<Types["output"]>().toEqualTypeOf<string>();
    expectTypeOf<Types["suspend"]>().toBeNever();
    expectTypeOf<Types["resume"]>().toBeNever();
    expectTypeOf<Types["context"]>().toEqualTypeOf<undefined>();
    expectTypeOf<Types["data"]>().toBeNever();
  });

  it("context tool: context is typed, rest defaults", () => {
    type Types = (typeof contextTool)["__toolTypes"];
    expectTypeOf<Types["context"]>().toEqualTypeOf<{ userId: string }>();
    expectTypeOf<Types["suspend"]>().toBeNever();
    expectTypeOf<Types["resume"]>().toBeNever();
    expectTypeOf<Types["data"]>().toBeNever();
  });

  it("suspendable tool: suspend + resume typed, context undefined", () => {
    type Types = (typeof suspendTool)["__toolTypes"];
    expectTypeOf<Types["suspend"]>().toEqualTypeOf<{ question: string }>();
    expectTypeOf<Types["resume"]>().toEqualTypeOf<{ answer: string }>();
    expectTypeOf<Types["context"]>().toEqualTypeOf<undefined>();
    expectTypeOf<Types["data"]>().toBeNever();
    // output excludes SuspendResult
    expectTypeOf<Types["output"]>().toEqualTypeOf<string>();
  });

  it("suspendable + context tool", () => {
    type Types = (typeof suspendContextTool)["__toolTypes"];
    expectTypeOf<Types["context"]>().toEqualTypeOf<{ locale: string }>();
    expectTypeOf<Types["suspend"]>().toEqualTypeOf<{ question: string }>();
    expectTypeOf<Types["resume"]>().toEqualTypeOf<{ answer: string }>();
  });

  it("data tool: data typed, rest defaults", () => {
    type Types = (typeof dataTool)["__toolTypes"];
    expectTypeOf<Types["data"]>().toEqualTypeOf<{
      progress: { step: number; total: number };
      status: { ok: boolean };
    }>();
    expectTypeOf<Types["context"]>().toEqualTypeOf<undefined>();
    expectTypeOf<Types["suspend"]>().toBeNever();
  });

  it("data + context tool", () => {
    type Types = (typeof dataContextTool)["__toolTypes"];
    expectTypeOf<Types["data"]>().toEqualTypeOf<{
      audit: { action: string };
    }>();
    expectTypeOf<Types["context"]>().toEqualTypeOf<{ orgId: string }>();
  });

  it("suspendable + data tool (no context)", () => {
    type Types = (typeof suspendDataTool)["__toolTypes"];
    expectTypeOf<Types["suspend"]>().toEqualTypeOf<{ question: string }>();
    expectTypeOf<Types["resume"]>().toEqualTypeOf<{ answer: string }>();
    expectTypeOf<Types["data"]>().toEqualTypeOf<{
      log: { message: string };
    }>();
    expectTypeOf<Types["context"]>().toEqualTypeOf<undefined>();
  });

  it("full tool: all 6 phantom slots correct", () => {
    type Types = (typeof fullTool)["__toolTypes"];
    expectTypeOf<Types["input"]>().toEqualTypeOf<{ cmd: string }>();
    expectTypeOf<Types["output"]>().toEqualTypeOf<string>();
    expectTypeOf<Types["suspend"]>().toEqualTypeOf<{ approval: string }>();
    expectTypeOf<Types["resume"]>().toEqualTypeOf<{ approved: boolean }>();
    expectTypeOf<Types["context"]>().toEqualTypeOf<{ tenantId: string }>();
    expectTypeOf<Types["data"]>().toEqualTypeOf<{
      progress: { pct: number };
    }>();
  });
});

// ────────────────────────────────────────────
// § 4. ToolDataEventFor
// ────────────────────────────────────────────

describe("ToolDataEventFor", () => {
  it("produces a discriminated union from tools with dataSchema", () => {
    type Tools = {
      deploy: typeof dataTool;
      plain: typeof plainTool;
    };
    type Event = ToolDataEventFor<Tools>;

    type ProgressEvent = Extract<Event, { type: "progress" }>;
    type StatusEvent = Extract<Event, { type: "status" }>;

    expectTypeOf<ProgressEvent["toolName"]>().toEqualTypeOf<"deploy">();
    expectTypeOf<ProgressEvent["data"]>().toEqualTypeOf<{
      step: number;
      total: number;
    }>();

    expectTypeOf<StatusEvent["toolName"]>().toEqualTypeOf<"deploy">();
    expectTypeOf<StatusEvent["data"]>().toEqualTypeOf<{ ok: boolean }>();
  });

  it("combines events from multiple data tools", () => {
    type Tools = {
      deploy: typeof dataTool;
      audit: typeof dataContextTool;
    };
    type Event = ToolDataEventFor<Tools>;

    // deploy events
    type DeployProgress = Extract<
      Event,
      { toolName: "deploy"; type: "progress" }
    >;
    expectTypeOf<DeployProgress["data"]>().toEqualTypeOf<{
      step: number;
      total: number;
    }>();

    // audit events
    type AuditEvent = Extract<Event, { toolName: "audit" }>;
    expectTypeOf<AuditEvent["type"]>().toEqualTypeOf<"audit">();
    expectTypeOf<AuditEvent["data"]>().toEqualTypeOf<{ action: string }>();
  });

  it("falls back to untyped ToolDataEvent when no tools have data", () => {
    type Tools = { plain: typeof plainTool };
    type Event = ToolDataEventFor<Tools>;

    expectTypeOf<Event["data"]>().toBeUnknown();
    expectTypeOf<Event["toolName"]>().toBeString();
  });

  it("inherits base ToolDataEvent fields (toolCallId, id, transient)", () => {
    type Tools = { deploy: typeof dataTool };
    type Event = ToolDataEventFor<Tools>;
    type Progress = Extract<Event, { type: "progress" }>;

    expectTypeOf<Progress["toolCallId"]>().toBeString();
    expectTypeOf<Progress["id"]>().toBeString();
    expectTypeOf<Progress>().toHaveProperty("transient");
  });
});

// ────────────────────────────────────────────
// § 5. Agent onToolData typing
// ────────────────────────────────────────────

describe("Agent onToolData typing", () => {
  type TestAgent = Agent<
    { deploy: typeof dataTool; greet: typeof plainTool },
    undefined
  >;

  it("stream() onToolData receives typed events", () => {
    type StreamOpts = Parameters<TestAgent["stream"]>[0];
    type OnToolData = NonNullable<StreamOpts["onToolData"]>;
    type Event = Parameters<OnToolData>[0];

    type ProgressEvent = Extract<Event, { type: "progress" }>;
    expectTypeOf<ProgressEvent["toolName"]>().toEqualTypeOf<"deploy">();
    expectTypeOf<ProgressEvent["data"]>().toEqualTypeOf<{
      step: number;
      total: number;
    }>();

    type StatusEvent = Extract<Event, { type: "status" }>;
    expectTypeOf<StatusEvent["data"]>().toEqualTypeOf<{ ok: boolean }>();
  });

  it("generate() onToolData receives typed events", () => {
    type GenOpts = Parameters<TestAgent["generate"]>[0];
    type OnToolData = NonNullable<GenOpts["onToolData"]>;
    type Event = Parameters<OnToolData>[0];

    type ProgressEvent = Extract<Event, { type: "progress" }>;
    expectTypeOf<ProgressEvent["data"]>().toEqualTypeOf<{
      step: number;
      total: number;
    }>();
  });
});

// ────────────────────────────────────────────
// § 6. StreamOptions / BaseGenerateOptions / ChatOptions — context conditional
// ────────────────────────────────────────────

describe("Options types — context conditional", () => {
  it("StreamOptions with context requires context property", () => {
    type Opts = StreamOptions<{ userId: string }>;
    expectTypeOf<Opts["context"]>().toEqualTypeOf<{ userId: string }>();
  });

  it("StreamOptions without context has context?: never", () => {
    type Opts = StreamOptions<undefined>;
    type HasContext = "context" extends keyof Opts ? true : false;
    // context key exists but is optional never
    expectTypeOf<HasContext>().toEqualTypeOf<true>();
    // It should be assignable with no context provided
    expectTypeOf<{ messages: [] }>().toMatchTypeOf<Opts>();
  });

  it("BaseGenerateOptions with context requires context property", () => {
    type Opts = BaseGenerateOptions<{ userId: string }>;
    expectTypeOf<Opts["context"]>().toEqualTypeOf<{ userId: string }>();
  });

  it("ChatOptions with context requires context property", () => {
    type Opts = ChatOptions<{ userId: string }>;
    expectTypeOf<Opts["context"]>().toEqualTypeOf<{ userId: string }>();
  });

  it("ChatOptions without context has context?: never", () => {
    type Opts = ChatOptions<undefined>;
    expectTypeOf<{ messages: [] }>().toMatchTypeOf<Pick<Opts, "context">>();
  });
});

// ────────────────────────────────────────────
// § 7. Agent type — context threading
// ────────────────────────────────────────────

describe("Agent type — context threading", () => {
  it("Agent with context requires context in stream()", () => {
    type A = Agent<Record<string, never>, { userId: string }>;
    type StreamOpts = Parameters<A["stream"]>[0];
    expectTypeOf<StreamOpts["context"]>().toEqualTypeOf<{
      userId: string;
    }>();
  });

  it("Agent with context requires context in generate()", () => {
    type A = Agent<Record<string, never>, { userId: string }>;
    type GenOpts = Parameters<A["generate"]>[0];
    expectTypeOf<GenOpts["context"]>().toEqualTypeOf<{ userId: string }>();
  });

  it("Agent with context requires context in chat()", () => {
    type A = Agent<Record<string, never>, { userId: string }>;
    type ChatOpts = Parameters<A["chat"]>[0];
    expectTypeOf<ChatOpts["context"]>().toEqualTypeOf<{
      userId: string;
    }>();
  });

  it("Agent without context does not accept context", () => {
    type A = Agent<Record<string, never>, undefined>;
    type StreamOpts = Parameters<A["stream"]>[0];
    expectTypeOf<{ messages: [] }>().toMatchTypeOf<
      Pick<StreamOpts, "context">
    >();
  });

  it("Agent system property accepts context function", () => {
    type A = Agent<Record<string, never>, { locale: string }>;
    type System = A["system"];
    // Should accept a function that takes the context
    expectTypeOf<(ctx: { locale: string }) => string>().toMatchTypeOf<
      NonNullable<System>
    >();
  });
});

// ────────────────────────────────────────────
// § 8. Tool config types (MappedToolEntry, ToolConfigValue, etc.)
// ────────────────────────────────────────────

describe("Tool config types", () => {
  it("MappedToolEntry accepts correct mapContext signature", () => {
    type Entry = MappedToolEntry<{ orgId: string }>;
    expectTypeOf<{
      tool: typeof contextTool;
      mapContext: (ctx: { orgId: string }) => { userId: string };
    }>().toMatchTypeOf<Entry>();
  });

  it("ToolConfigValue<undefined> is exactly Tool (no mapped entry)", () => {
    type V = ToolConfigValue<undefined>;
    // Plain tools should be assignable
    expectTypeOf<typeof plainTool>().toMatchTypeOf<V>();
  });

  it("ToolConfigValue<C> allows both plain Tool and MappedToolEntry", () => {
    type V = ToolConfigValue<{ orgId: string }>;
    // Plain tool should be assignable
    expectTypeOf<typeof plainTool>().toMatchTypeOf<V>();
    // Mapped entry should also be assignable
    expectTypeOf<{
      tool: typeof contextTool;
      mapContext: (ctx: { orgId: string }) => { userId: string };
    }>().toMatchTypeOf<V>();
  });

  it("ResolveToolEntry passes through plain Tool", () => {
    type Resolved = ResolveToolEntry<typeof plainTool>;
    expectTypeOf<Resolved>().toEqualTypeOf<typeof plainTool>();
  });

  it("ResolveToolEntry unwraps mapped entry to the tool type", () => {
    type Entry = { tool: typeof contextTool; mapContext: (ctx: any) => any };
    type Resolved = ResolveToolEntry<Entry>;
    expectTypeOf<Resolved>().toEqualTypeOf<typeof contextTool>();
  });

  it("ResolveToolsConfig unwraps a record of mixed entries", () => {
    type Config = {
      plain: typeof plainTool;
      mapped: {
        tool: typeof contextTool;
        mapContext: (ctx: any) => any;
      };
    };
    type Resolved = ResolveToolsConfig<Config>;

    expectTypeOf<Resolved["plain"]>().toEqualTypeOf<typeof plainTool>();
    expectTypeOf<Resolved["mapped"]>().toEqualTypeOf<typeof contextTool>();
  });
});

// ────────────────────────────────────────────
// § 9. ValidateMappedTools
// ────────────────────────────────────────────

describe("ValidateMappedTools", () => {
  it("constrains mapContext return type to match tool context", () => {
    type AgentCtx = { orgId: string };
    type ToolCtx = { userId: string };

    type Input = {
      myTool: {
        tool: ZaikitTool<any, any, never, never, ToolCtx>;
        mapContext: (ctx: AgentCtx) => ToolCtx;
      };
    };

    type Validated = ValidateMappedTools<Input, AgentCtx>;
    type MapContextFn = Validated["myTool"]["mapContext"];

    // mapContext should accept AgentCtx and return ToolCtx
    expectTypeOf<MapContextFn>().toEqualTypeOf<(ctx: AgentCtx) => ToolCtx>();
  });

  it("passes through plain tool entries unchanged", () => {
    type Input = {
      plain: typeof plainTool;
    };
    type Validated = ValidateMappedTools<Input, { orgId: string }>;
    expectTypeOf<Validated["plain"]>().toEqualTypeOf<typeof plainTool>();
  });
});

// ────────────────────────────────────────────
// § 10. PrepareStep — context in callback
// ────────────────────────────────────────────

describe("PrepareStep context", () => {
  it("PrepareStep with context provides typed context in options", () => {
    type Step = PrepareStep<Record<string, never>, { userId: string }>;
    // Extract the first parameter's context field
    type StepOpts = Parameters<Step>[0];
    expectTypeOf<StepOpts["context"]>().toEqualTypeOf<{
      userId: string;
    }>();
  });

  it("PrepareStep without context provides undefined", () => {
    type Step = PrepareStep<Record<string, never>, undefined>;
    type StepOpts = Parameters<Step>[0];
    expectTypeOf<StepOpts["context"]>().toEqualTypeOf<undefined>();
  });
});

// ────────────────────────────────────────────
// § 11. WriteDataPart / WriteToolDataFn / ToolDataEvent
// ────────────────────────────────────────────

describe("write-data types", () => {
  it("WriteDataPart has correct shape", () => {
    expectTypeOf<WriteDataPart>().toHaveProperty("type");
    expectTypeOf<WriteDataPart>().toHaveProperty("data");
    expectTypeOf<WriteDataPart["type"]>().toBeString();
    expectTypeOf<WriteDataPart["data"]>().toBeUnknown();
    expectTypeOf<WriteDataPart["id"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<WriteDataPart["transient"]>().toEqualTypeOf<
      boolean | undefined
    >();
  });

  it("WriteToolDataFn is generic on DATA record", () => {
    type Fn = WriteToolDataFn<{
      progress: { step: number };
      status: { ok: boolean };
    }>;
    // Should accept valid calls
    expectTypeOf<Fn>().toBeCallableWith("progress", { step: 1 });
    expectTypeOf<Fn>().toBeCallableWith("status", { ok: true });
  });

  it("ToolDataEvent has correct shape", () => {
    expectTypeOf<ToolDataEvent["toolName"]>().toBeString();
    expectTypeOf<ToolDataEvent["toolCallId"]>().toBeString();
    expectTypeOf<ToolDataEvent["type"]>().toBeString();
    expectTypeOf<ToolDataEvent["data"]>().toBeUnknown();
    expectTypeOf<ToolDataEvent["id"]>().toBeString();
  });
});

// ────────────────────────────────────────────
// § 12. CreateAgentOptions — context conditional
// ────────────────────────────────────────────

describe("CreateAgentOptions — context", () => {
  it("with context schema, requires context field", () => {
    type Opts = CreateAgentOptions<Record<string, never>, { userId: string }>;
    expectTypeOf<Opts["context"]>().toMatchTypeOf<
      z.ZodType<{ userId: string }>
    >();
  });

  it("without context schema, has context?: never", () => {
    type Opts = CreateAgentOptions<Record<string, never>, undefined>;
    type HasContext = "context" extends keyof Opts ? true : false;
    expectTypeOf<HasContext>().toEqualTypeOf<true>();
  });

  it("system accepts context function when context is typed", () => {
    type Opts = CreateAgentOptions<Record<string, never>, { locale: string }>;
    expectTypeOf<(ctx: { locale: string }) => string>().toMatchTypeOf<
      NonNullable<Opts["system"]>
    >();
  });
});

// ────────────────────────────────────────────
// § 13. End-to-end: Agent with mapped tools
// ────────────────────────────────────────────

describe("Agent with mapped tools — end-to-end types", () => {
  it("agent tools property has unwrapped tool types", () => {
    type A = Agent<
      { myTool: typeof contextTool; plain: typeof plainTool },
      { orgId: string }
    >;
    type Tools = A["tools"];

    expectTypeOf<Tools["myTool"]>().toEqualTypeOf<typeof contextTool>();
    expectTypeOf<Tools["plain"]>().toEqualTypeOf<typeof plainTool>();
  });

  it("agent with data tools threads ToolDataEventFor through stream()", () => {
    type A = Agent<
      { deploy: typeof dataTool; audit: typeof dataContextTool },
      undefined
    >;
    type StreamOpts = Parameters<A["stream"]>[0];
    type OnToolData = NonNullable<StreamOpts["onToolData"]>;
    type Event = Parameters<OnToolData>[0];

    // Should be a discriminated union, not the generic fallback
    type DeployProgress = Extract<
      Event,
      { toolName: "deploy"; type: "progress" }
    >;
    expectTypeOf<DeployProgress["data"]>().toEqualTypeOf<{
      step: number;
      total: number;
    }>();

    type AuditEvent = Extract<Event, { toolName: "audit"; type: "audit" }>;
    expectTypeOf<AuditEvent["data"]>().toEqualTypeOf<{ action: string }>();
  });
});

// ────────────────────────────────────────────
// § 14. SuspendResult
// ────────────────────────────────────────────

describe("SuspendResult", () => {
  it("is branded with __suspended: true and carries payload", () => {
    type SR = SuspendResult<{ question: string }>;
    expectTypeOf<SR["__suspended"]>().toEqualTypeOf<true>();
    expectTypeOf<SR["payload"]>().toEqualTypeOf<{ question: string }>();
  });
});

// ────────────────────────────────────────────
// § 15. AgentResult / StreamResult / GenerateResult
// ────────────────────────────────────────────

describe("Result types", () => {
  it("AgentResult shape", () => {
    expectTypeOf<AgentResult["text"]>().toBeString();
    expectTypeOf<AgentResult["output"]>().toBeUnknown();
    expectTypeOf<AgentResult["finishReason"]>().toBeString();
    expectTypeOf<AgentResult>().toHaveProperty("steps");
    expectTypeOf<AgentResult>().toHaveProperty("usage");
  });

  it("StreamResult shape", () => {
    expectTypeOf<StreamResult["stream"]>().toEqualTypeOf<
      ReadableStream<unknown>
    >();
    expectTypeOf<StreamResult["result"]>().toEqualTypeOf<
      Promise<AgentResult>
    >();
  });

  it("GenerateResult with no output generic has output: undefined", () => {
    type R = GenerateResult;
    expectTypeOf<R["output"]>().toEqualTypeOf<undefined>();
  });

  it("GenerateResult narrows output to schema type", () => {
    type Schema = z.ZodObject<{ name: z.ZodString }>;
    type R = GenerateResult<Schema>;
    expectTypeOf<R["output"]>().toEqualTypeOf<{ name: string }>();
  });

  it("GenerateResult inherits AgentResult fields", () => {
    type R = GenerateResult;
    expectTypeOf<R["text"]>().toBeString();
    expectTypeOf<R["finishReason"]>().toBeString();
    expectTypeOf<R>().toHaveProperty("steps");
    expectTypeOf<R>().toHaveProperty("usage");
  });
});

// ────────────────────────────────────────────
// § 16. Agent method return types
// ────────────────────────────────────────────

describe("Agent method signatures", () => {
  type A = Agent<{ greet: typeof plainTool }, undefined>;

  it("stream() returns Promise<StreamResult>", () => {
    expectTypeOf<ReturnType<A["stream"]>>().toEqualTypeOf<
      Promise<StreamResult>
    >();
  });

  it("chat() returns Promise<Response>", () => {
    expectTypeOf<ReturnType<A["chat"]>>().toEqualTypeOf<Promise<Response>>();
  });

  it("tools property is the ToolSet", () => {
    expectTypeOf<A["tools"]["greet"]>().toEqualTypeOf<typeof plainTool>();
  });
});

// ────────────────────────────────────────────
// § 17. WriteDataPart regression guards
// ────────────────────────────────────────────

describe("WriteDataPart — regression guards", () => {
  it("does NOT have a scope property (removed)", () => {
    type HasScope = "scope" extends keyof WriteDataPart ? true : false;
    expectTypeOf<HasScope>().toEqualTypeOf<false>();
  });

  it("does NOT have toolCallId or toolName (internal only)", () => {
    type HasToolCallId = "toolCallId" extends keyof WriteDataPart
      ? true
      : false;
    type HasToolName = "toolName" extends keyof WriteDataPart ? true : false;
    expectTypeOf<HasToolCallId>().toEqualTypeOf<false>();
    expectTypeOf<HasToolName>().toEqualTypeOf<false>();
  });
});
