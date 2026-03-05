import BuildIcon from "@mui/icons-material/Build";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Box,
  Chip,
  Typography,
} from "@mui/material";
import { useAgent } from "@zaikit/react";
import { useEffect, useState } from "react";
import { ResumeForm } from "./ResumeForm";
import { useTokens } from "./theme";

type ToolPart = {
  type: string;
  toolCallId: string;
  toolName?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
  // Added by enrichToolPartsWithSuspendData in @zaikit/utils
  suspend?: { toolCallId: string; payload: unknown };
};

function getToolName(part: ToolPart): string {
  if (part.toolName) return part.toolName;
  if (part.type.startsWith("tool-")) return part.type.slice(5);
  return "unknown";
}

function getState(part: ToolPart): "call" | "suspended" | "result" {
  if (part.state === "output-available" || part.output !== undefined) {
    return "result";
  }
  if (part.suspend) return "suspended";
  return "call";
}

export function GenericToolCard({
  part,
  resumeSchema,
}: {
  part: ToolPart;
  resumeSchema?: Record<string, unknown>;
}) {
  const { resumeTool } = useAgent();
  const tokens = useTokens();
  const toolName = getToolName(part);
  const state = getState(part);
  const suspendPayload = part.suspend?.payload;
  const [expanded, setExpanded] = useState(false);

  // Auto-expand when tool becomes suspended
  useEffect(() => {
    if (state === "suspended") setExpanded(true);
  }, [state]);

  const stateColor =
    state === "result" ? "success" : state === "suspended" ? "warning" : "info";
  const StateIcon =
    state === "result"
      ? CheckCircleIcon
      : state === "suspended"
        ? PauseCircleIcon
        : BuildIcon;

  return (
    <Accordion
      expanded={expanded}
      onChange={(_, isExpanded) => setExpanded(isExpanded)}
      disableGutters
      sx={{
        my: 1,
        border: "1px solid",
        borderColor: "divider",
        borderRadius: "8px !important",
        "&:before": { display: "none" },
        overflow: "hidden",
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{
          minHeight: 44,
          "& .MuiAccordionSummary-content": {
            alignItems: "center",
            gap: 1,
          },
        }}
      >
        <StateIcon color={stateColor} sx={{ fontSize: 18 }} />
        <Typography
          variant="body2"
          fontWeight={600}
          sx={{ fontFamily: "monospace" }}
        >
          {toolName}
        </Typography>
        <Chip
          label={state}
          size="small"
          color={stateColor}
          variant="outlined"
          sx={{ fontSize: "0.65rem", height: 20 }}
        />
      </AccordionSummary>
      <AccordionDetails sx={{ pt: 0 }}>
        {/* Input */}
        {part.input !== undefined && (
          <Box sx={{ mb: 1.5 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              fontWeight={600}
            >
              Input
            </Typography>
            <Box
              component="pre"
              sx={{
                mt: 0.5,
                p: 1.5,
                bgcolor: tokens.schema.input,
                borderRadius: "6px",
                fontSize: "0.75rem",
                overflow: "auto",
                maxHeight: 200,
              }}
            >
              {JSON.stringify(part.input, null, 2)}
            </Box>
          </Box>
        )}

        {/* Suspend payload */}
        {state === "suspended" && suspendPayload !== undefined && (
          <Box sx={{ mb: 1.5 }}>
            <Typography
              variant="caption"
              color="text.secondary"
              fontWeight={600}
            >
              Suspend Payload
            </Typography>
            <Box
              component="pre"
              sx={{
                mt: 0.5,
                p: 1.5,
                bgcolor: tokens.schema.suspend,
                borderRadius: "6px",
                fontSize: "0.75rem",
                overflow: "auto",
                maxHeight: 200,
              }}
            >
              {JSON.stringify(suspendPayload, null, 2)}
            </Box>
          </Box>
        )}

        {/* Resume form */}
        {state === "suspended" && resumeTool && (
          <ResumeForm
            onResume={(data) => resumeTool(part.toolCallId, data)}
            resumeSchema={resumeSchema}
          />
        )}

        {/* Output */}
        {state === "result" && part.output !== undefined && (
          <Box>
            <Typography
              variant="caption"
              color="text.secondary"
              fontWeight={600}
            >
              Output
            </Typography>
            <Box
              component="pre"
              sx={{
                mt: 0.5,
                p: 1.5,
                bgcolor: tokens.schema.output,
                borderRadius: "6px",
                fontSize: "0.75rem",
                overflow: "auto",
                maxHeight: 200,
              }}
            >
              {JSON.stringify(part.output, null, 2)}
            </Box>
          </Box>
        )}
      </AccordionDetails>
    </Accordion>
  );
}
