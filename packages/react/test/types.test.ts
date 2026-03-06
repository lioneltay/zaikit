/**
 * Type-level tests for @zaikit/react consumer types.
 *
 * Verifies that ToolRenderProps, TypedToolData, and ToolRenderState
 * generics flow correctly to their respective properties.
 */

import { describe, expectTypeOf, it } from "vitest";
import type {
  ToolRenderProps,
  ToolRenderState,
  TypedToolData,
} from "../src/types";

// ─── TypedToolData ───

describe("TypedToolData", () => {
  it("maps keys to optional arrays with typed data", () => {
    type TD = TypedToolData<{
      progress: { step: number; total: number };
      status: { ok: boolean };
    }>;

    expectTypeOf<TD["progress"]>().toEqualTypeOf<
      Array<{ id: string; data: { step: number; total: number } }> | undefined
    >();
    expectTypeOf<TD["status"]>().toEqualTypeOf<
      Array<{ id: string; data: { ok: boolean } }> | undefined
    >();
  });

  it("default generic accepts any string key", () => {
    type TD = TypedToolData;
    // Should be indexable with any string
    type Val = TD[string];
    expectTypeOf<Val>().toEqualTypeOf<
      Array<{ id: string; data: unknown }> | undefined
    >();
  });
});

// ─── ToolRenderProps ───

describe("ToolRenderProps", () => {
  it("generic parameters flow to correct properties", () => {
    type Props = ToolRenderProps<
      { name: string },
      { question: string },
      { answer: string },
      { progress: { step: number } }
    >;

    expectTypeOf<Props["args"]>().toEqualTypeOf<{ name: string }>();
    expectTypeOf<Props["suspendPayload"]>().toEqualTypeOf<
      { question: string } | undefined
    >();
    // resume callback accepts TResume
    expectTypeOf<Parameters<Props["resume"]>[0]>().toEqualTypeOf<{
      answer: string;
    }>();
    // toolData is TypedToolData<TData>
    expectTypeOf<Props["toolData"]>().toEqualTypeOf<
      TypedToolData<{ progress: { step: number } }>
    >();
  });

  it("defaults use wide types when generics omitted", () => {
    type Props = ToolRenderProps;

    expectTypeOf<Props["args"]>().toEqualTypeOf<Record<string, unknown>>();
    expectTypeOf<Props["suspendPayload"]>().toEqualTypeOf<
      unknown | undefined
    >();
    expectTypeOf<Parameters<Props["resume"]>[0]>().toBeUnknown();
    expectTypeOf<Props["toolData"]>().toEqualTypeOf<
      TypedToolData<Record<string, unknown>>
    >();
  });

  it("non-generic properties are always correct", () => {
    type Props = ToolRenderProps<{ x: number }>;

    expectTypeOf<Props["toolCallId"]>().toBeString();
    expectTypeOf<Props["toolName"]>().toBeString();
    expectTypeOf<Props["state"]>().toEqualTypeOf<ToolRenderState>();
    expectTypeOf<Props["result"]>().toBeUnknown();
    expectTypeOf<Props["error"]>().toEqualTypeOf<string | undefined>();
  });

  it("partial generics: only Input specified, rest default", () => {
    type Props = ToolRenderProps<{ service: string }>;

    expectTypeOf<Props["args"]>().toEqualTypeOf<{ service: string }>();
    // suspend/resume/data use defaults
    expectTypeOf<Props["suspendPayload"]>().toEqualTypeOf<
      unknown | undefined
    >();
    expectTypeOf<Parameters<Props["resume"]>[0]>().toBeUnknown();
  });
});

// ─── ToolRenderState ───

describe("ToolRenderState", () => {
  it("is exactly the 4 expected states", () => {
    expectTypeOf<ToolRenderState>().toEqualTypeOf<
      "call" | "suspended" | "result" | "error"
    >();
  });
});
