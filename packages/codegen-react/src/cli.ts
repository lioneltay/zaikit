#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { extractToolTypes } from "./extract";
import { generateOutput } from "./generate";

function findTsConfig(startDir: string): string | null {
  let dir = startDir;
  while (true) {
    const candidate = path.join(dir, "tsconfig.json");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function parseArgs(argv: string[]): {
  agent: string;
  export: string;
  output: string;
  tsconfig: string | undefined;
} {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const eqIdx = arg.indexOf("=");
      if (eqIdx !== -1) {
        args[arg.slice(2, eqIdx)] = arg.slice(eqIdx + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) {
        args[arg.slice(2)] = argv[++i];
      }
    }
  }

  if (!args.agent) {
    console.error(
      "Usage: zaikit-codegen-react --agent <path> --output <path> [--export <name>] [--tsconfig <path>]",
    );
    process.exit(1);
  }
  if (!args.output) {
    console.error("Missing required --output flag");
    process.exit(1);
  }

  return {
    agent: args.agent,
    export: args.export ?? "agent",
    output: args.output,
    tsconfig: args.tsconfig,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const cwd = process.cwd();

  const agentPath = path.resolve(cwd, args.agent);
  const outputPath = path.resolve(cwd, args.output);

  if (!fs.existsSync(agentPath)) {
    console.error(`Agent file not found: ${agentPath}`);
    process.exit(1);
  }

  const tsConfigPath = args.tsconfig
    ? path.resolve(cwd, args.tsconfig)
    : findTsConfig(path.dirname(agentPath));

  if (!tsConfigPath) {
    console.error(
      `Could not find tsconfig.json from ${path.dirname(agentPath)}. Use --tsconfig to specify one.`,
    );
    process.exit(1);
  }

  console.log(`Agent:    ${agentPath}`);
  console.log(`Export:   ${args.export}`);
  console.log(`TSConfig: ${tsConfigPath}`);
  console.log(`Output:   ${outputPath}`);
  console.log("");

  const tools = extractToolTypes({
    tsConfigPath,
    agentPath,
    exportName: args.export,
  });

  if (tools.length === 0) {
    console.warn("No tools found on the agent. Generated file will be empty.");
  }

  const output = generateOutput(tools);

  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  fs.writeFileSync(outputPath, output);
  console.log(`Generated ${tools.length} tool type(s) → ${outputPath}`);
}

main().then(() => process.exit(0));
