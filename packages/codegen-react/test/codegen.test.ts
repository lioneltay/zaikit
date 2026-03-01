import path from "node:path";
import { describe, expect, it } from "vitest";
import { extractToolTypes, type ToolTypeInfo } from "../src/extract";
import { generateOutput, toPascalCase } from "../src/generate";

// ─── toPascalCase ───

describe("toPascalCase", () => {
  it("converts snake_case", () => {
    expect(toPascalCase("snake_case")).toBe("SnakeCase");
  });

  it("converts camelCase", () => {
    expect(toPascalCase("camelCase")).toBe("CamelCase");
  });

  it("converts kebab-case", () => {
    expect(toPascalCase("kebab-case")).toBe("KebabCase");
  });
});

// ─── generateOutput ───

describe("generateOutput", () => {
  it("produces ToolName = never for empty tools", () => {
    const output = generateOutput([]);
    expect(output).toContain("export type ToolName = never;");
    expect(output).toContain("export { _useToolRenderer as useToolRenderer };");
  });

  it("generates types for a regular tool", () => {
    const tools: ToolTypeInfo[] = [
      {
        name: "greet",
        input: "{ name: string }",
        output: "{ message: string }",
        suspend: null,
        resume: null,
      },
    ];
    const output = generateOutput(tools);

    expect(output).toContain("export type GreetInput = { name: string };");
    expect(output).toContain("export type GreetOutput = { message: string };");
    expect(output).not.toContain("GreetSuspend");
    expect(output).not.toContain("GreetResume");
    // Regular tool: ToolRenderProps<Input> (1 param)
    expect(output).toContain(
      "export type GreetToolProps = ToolRenderProps<GreetInput>;",
    );
    expect(output).toContain("greet: GreetToolProps;");
  });

  it("generates types for a suspendable tool", () => {
    const tools: ToolTypeInfo[] = [
      {
        name: "book_flight",
        input: "{ from: string; to: string }",
        output: "{ confirmation: string }",
        suspend: "{ options: string[] }",
        resume: "{ selected: number }",
      },
    ];
    const output = generateOutput(tools);

    expect(output).toContain(
      "export type BookFlightSuspend = { options: string[] };",
    );
    expect(output).toContain(
      "export type BookFlightResume = { selected: number };",
    );
    // Suspendable tool: ToolRenderProps<Input, Suspend, Resume> (3 params)
    expect(output).toContain(
      "export type BookFlightToolProps = ToolRenderProps<BookFlightInput, BookFlightSuspend, BookFlightResume>;",
    );
  });
});

// ─── extractToolTypes + full pipeline ───

describe("extractToolTypes", () => {
  const fixtureDir = path.resolve(__dirname, "fixtures");
  const tsConfigPath = path.join(fixtureDir, "tsconfig.json");
  const agentPath = path.join(fixtureDir, "agent.ts");

  // Single extraction — reused by all integration tests and the snapshot test.
  const tools = extractToolTypes({
    tsConfigPath,
    agentPath,
    exportName: "agent",
  });

  it("extracts the correct number of tools", () => {
    expect(tools).toHaveLength(2);
  });

  it("extracts a regular tool with null suspend/resume", () => {
    const greet = tools.find((t) => t.name === "greet");
    expect(greet).toBeDefined();
    expect(greet?.suspend).toBeNull();
    expect(greet?.resume).toBeNull();
  });

  it("extracts a suspendable tool with non-null suspend/resume", () => {
    const bookFlight = tools.find((t) => t.name === "book_flight");
    expect(bookFlight).toBeDefined();
    expect(bookFlight?.suspend).not.toBeNull();
    expect(bookFlight?.resume).not.toBeNull();
  });

  it("output types do not contain import(...) expressions", () => {
    for (const tool of tools) {
      expect(tool.input).not.toMatch(/import\(/);
      expect(tool.output).not.toMatch(/import\(/);
      if (tool.suspend) expect(tool.suspend).not.toMatch(/import\(/);
      if (tool.resume) expect(tool.resume).not.toMatch(/import\(/);
    }
  });

  it("full pipeline matches snapshot", () => {
    const output = generateOutput(tools);
    expect(output).toMatchSnapshot();
  });
});
