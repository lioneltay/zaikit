import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Button,
  Chip,
  Divider,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { jsonSchemaToTypeString } from "../../src/schema-utils";
import type { ToolInfo } from "./api";
import { ToolTestPanel } from "./ToolTestPanel";
import { type Tokens, useTokens } from "./theme";

function HighlightedType({
  code,
  syntax,
}: {
  code: string;
  syntax: Tokens["syntax"];
}) {
  const tokenRegex =
    /("(?:[^"\\]|\\.)*")|(\b(?:string|number|boolean|null|unknown)\b(?:\[\])?)|([a-zA-Z_]\w*\??)(?=\s*:)|([{}[\]()])|(\|)|(:)|([\s,;]+)/g;

  const elements: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null = tokenRegex.exec(code);

  while (match !== null) {
    if (match.index > lastIndex) {
      elements.push(code.slice(lastIndex, match.index));
    }

    const [full, stringLit, typeName, propKey, brace, pipe, colon, ws] = match;
    const i = elements.length;

    if (stringLit) {
      elements.push(
        <span key={i} style={{ color: syntax.string }}>
          {full}
        </span>,
      );
    } else if (typeName) {
      elements.push(
        <span key={i} style={{ color: syntax.type }}>
          {full}
        </span>,
      );
    } else if (propKey) {
      const isOptional = propKey.endsWith("?");
      elements.push(
        <span key={i} style={{ color: syntax.key }}>
          {isOptional ? propKey.slice(0, -1) : propKey}
        </span>,
      );
      if (isOptional) {
        elements.push(
          <span key={`${i}-opt`} style={{ color: syntax.optional }}>
            ?
          </span>,
        );
      }
    } else if (brace) {
      elements.push(
        <span key={i} style={{ color: syntax.brace, fontWeight: 600 }}>
          {full}
        </span>,
      );
    } else if (pipe || colon) {
      elements.push(
        <span key={i} style={{ color: syntax.punctuation }}>
          {full}
        </span>,
      );
    } else if (ws) {
      elements.push(full);
    } else {
      elements.push(full);
    }

    lastIndex = match.index + full.length;
    match = tokenRegex.exec(code);
  }

  if (lastIndex < code.length) {
    elements.push(code.slice(lastIndex));
  }

  return <>{elements}</>;
}

function SchemaBlock({
  label,
  schema,
  bgcolor,
}: {
  label: string;
  schema: Record<string, unknown>;
  bgcolor: string;
}) {
  const tokens = useTokens();
  const code = jsonSchemaToTypeString(schema);
  return (
    <Box sx={{ mb: 1 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {label}
      </Typography>
      <Box
        component="pre"
        sx={{
          mt: 0.25,
          p: 1,
          bgcolor,
          borderRadius: "4px",
          fontSize: "0.75rem",
          fontFamily: '"SF Mono", "Fira Code", Menlo, Consolas, monospace',
          overflow: "auto",
          maxHeight: 200,
          whiteSpace: "pre",
          lineHeight: 1.6,
        }}
      >
        <HighlightedType code={code} syntax={tokens.syntax} />
      </Box>
    </Box>
  );
}

export function ToolSection({
  tool,
  agentName,
  agentContext,
}: {
  tool: ToolInfo;
  agentName: string;
  agentContext: Record<string, unknown>;
}) {
  const tokens = useTokens();
  const [showTest, setShowTest] = useState(false);

  return (
    <Accordion
      disableGutters
      sx={{
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "6px !important",
        mb: 0.5,
        "&:before": { display: "none" },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          minHeight: 36,
          "& .MuiAccordionSummary-content": {
            alignItems: "center",
            gap: 0.5,
          },
        }}
      >
        <Typography
          variant="body2"
          fontWeight={600}
          sx={{ fontFamily: "monospace", fontSize: "0.8rem" }}
        >
          {tool.name}
        </Typography>
        {tool.suspendSchema && (
          <Chip
            label="suspendable"
            size="small"
            color="warning"
            variant="outlined"
            sx={{ fontSize: "0.6rem", height: 18 }}
          />
        )}
        {tool.contextSchema && (
          <Chip
            label="context"
            size="small"
            color="info"
            variant="outlined"
            sx={{ fontSize: "0.6rem", height: 18 }}
          />
        )}
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        {tool.description && (
          <Typography
            variant="body2"
            color="text.secondary"
            sx={{ mb: 1, fontSize: "0.8rem" }}
          >
            {tool.description}
          </Typography>
        )}
        {tool.parameters && (
          <SchemaBlock
            label="Input Schema"
            schema={tool.parameters}
            bgcolor={tokens.schema.input}
          />
        )}
        {tool.contextSchema && (
          <SchemaBlock
            label="Context Schema"
            schema={tool.contextSchema}
            bgcolor={tokens.schema.input}
          />
        )}
        {tool.suspendSchema && (
          <SchemaBlock
            label="Suspend Schema"
            schema={tool.suspendSchema}
            bgcolor={tokens.schema.suspend}
          />
        )}
        {tool.resumeSchema && (
          <SchemaBlock
            label="Resume Schema"
            schema={tool.resumeSchema}
            bgcolor={tokens.schema.resume}
          />
        )}
        <Divider sx={{ my: 1.5 }} />
        <Button
          variant="outlined"
          size="small"
          startIcon={<PlayArrowIcon />}
          onClick={(e) => {
            e.stopPropagation();
            setShowTest((v) => !v);
          }}
        >
          {showTest ? "Hide Test" : "Test Tool"}
        </Button>
        {showTest && (
          <ToolTestPanel
            agentName={agentName}
            toolName={tool.name}
            parameters={tool.parameters}
            agentContext={agentContext}
            toolContextSchema={tool.contextSchema}
          />
        )}
      </AccordionDetails>
    </Accordion>
  );
}
