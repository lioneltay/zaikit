import CloseIcon from "@mui/icons-material/Close";
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
  IconButton,
  Typography,
} from "@mui/material";
import { useState } from "react";
import type { AgentDetail } from "./api";
import { jsonSchemaToTypeString } from "./schema-utils";
import { ToolTestPanel } from "./ToolTestPanel";
import { type Tokens, useTokens } from "./theme";

/**
 * Render a TypeScript-like type string with syntax highlighting.
 */
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

export function AgentInfo({
  agentDetail: detail,
  onClose,
}: {
  agentDetail: AgentDetail | null;
  onClose: () => void;
}) {
  const tokens = useTokens();
  const [openTestPanels, setOpenTestPanels] = useState<Set<string>>(new Set());

  const toggleTestPanel = (toolName: string) => {
    setOpenTestPanels((prev) => {
      const next = new Set(prev);
      if (next.has(toolName)) {
        next.delete(toolName);
      } else {
        next.add(toolName);
      }
      return next;
    });
  };

  if (!detail) return null;

  return (
    <Box
      sx={{
        width: 400,
        height: "100%",
        borderLeft: "1px solid",
        borderColor: "divider",
        overflowY: "auto",
        bgcolor: "background.paper",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          p: 2,
          borderBottom: "1px solid",
          borderColor: "divider",
        }}
      >
        <Typography variant="subtitle1" fontWeight={600}>
          Agent Info
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </Box>

      <Box sx={{ p: 2 }}>
        {/* Model */}
        <Box sx={{ mb: 2 }}>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Model
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.25 }}>
            {detail.model}
          </Typography>
        </Box>

        {/* System Prompt */}
        {detail.system && (
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              fontWeight={600}
            >
              System Prompt
            </Typography>
            <Box
              component="pre"
              sx={{
                mt: 0.5,
                p: 1.5,
                bgcolor: tokens.schema.systemPrompt,
                borderRadius: "6px",
                fontSize: "0.75rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 300,
                overflow: "auto",
              }}
            >
              {detail.system}
            </Box>
          </Box>
        )}

        {/* Tools */}
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Tools ({detail.tools.length})
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          {detail.tools.map((tool) => (
            <Accordion
              key={tool.name}
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
                    toggleTestPanel(tool.name);
                  }}
                >
                  {openTestPanels.has(tool.name) ? "Hide Test" : "Test Tool"}
                </Button>
                {openTestPanels.has(tool.name) && (
                  <ToolTestPanel
                    agentName={detail.name}
                    toolName={tool.name}
                    parameters={tool.parameters}
                  />
                )}
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>
      </Box>
    </Box>
  );
}
