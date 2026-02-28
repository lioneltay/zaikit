import { Project, ts } from "ts-morph";

export type ToolTypeInfo = {
  name: string;
  input: string;
  output: string;
  suspend: string | null;
  resume: string | null;
};

export function extractToolTypes(options: {
  tsConfigPath: string;
  agentPath: string;
  exportName: string;
}): ToolTypeInfo[] {
  const { tsConfigPath, agentPath, exportName } = options;

  const project = new Project({ tsConfigFilePath: tsConfigPath });
  const sourceFile = project.getSourceFileOrThrow(agentPath);

  const declarations = sourceFile.getExportedDeclarations().get(exportName);
  if (!declarations || declarations.length === 0) {
    throw new Error(
      `Export "${exportName}" not found in ${agentPath}`,
    );
  }
  const agentDecl = declarations[0];
  const agentType = agentDecl.getType();

  const toolsProp = agentType.getProperty("tools");
  if (!toolsProp) {
    throw new Error(
      `Agent export "${exportName}" has no "tools" property. ` +
      `Make sure createAgent is generic (see @lioneltay/aikit-core).`,
    );
  }
  const toolsType = toolsProp.getTypeAtLocation(agentDecl);
  const result: ToolTypeInfo[] = [];

  for (const prop of toolsType.getProperties()) {
    const toolName = prop.getName();
    const toolType = prop.getTypeAtLocation(agentDecl);

    const brandProp = toolType.getProperty("__toolTypes");
    if (!brandProp) {
      console.warn(
        `Tool "${toolName}" missing __toolTypes brand — skipping (not an AikitTool?)`,
      );
      continue;
    }
    const brandType = brandProp.getTypeAtLocation(agentDecl);

    const formatFlags =
      ts.TypeFormatFlags.NoTruncation |
      ts.TypeFormatFlags.UseFullyQualifiedType;

    const inputProp = brandType.getProperty("input");
    const outputProp = brandType.getProperty("output");
    const suspendProp = brandType.getProperty("suspend");
    const resumeProp = brandType.getProperty("resume");

    if (!inputProp) {
      console.warn(`Tool "${toolName}" missing __toolTypes.input — skipping`);
      continue;
    }

    const inputType = inputProp.getTypeAtLocation(agentDecl);
    const outputType = outputProp
      ? outputProp.getTypeAtLocation(agentDecl)
      : null;
    const suspendType = suspendProp
      ? suspendProp.getTypeAtLocation(agentDecl)
      : null;
    const resumeType = resumeProp
      ? resumeProp.getTypeAtLocation(agentDecl)
      : null;

    result.push({
      name: toolName,
      input: inputType.getText(agentDecl, formatFlags),
      output: outputType
        ? outputType.getText(agentDecl, formatFlags)
        : "unknown",
      suspend:
        suspendType && !suspendType.isNever()
          ? suspendType.getText(agentDecl, formatFlags)
          : null,
      resume:
        resumeType && !resumeType.isNever()
          ? resumeType.getText(agentDecl, formatFlags)
          : null,
    });
  }

  return result;
}
