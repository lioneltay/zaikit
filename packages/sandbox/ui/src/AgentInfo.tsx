import CloseIcon from "@mui/icons-material/Close";
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import type { AgentDetail } from "./api";
import { SchemaField } from "./SchemaField";
import { ToolSection } from "./ToolSection";
import { useTokens } from "./theme";

export function AgentInfo({
  agentDetail: detail,
  open,
  onClose,
  agentContext,
  onAgentContextChange,
}: {
  agentDetail: AgentDetail | null;
  open: boolean;
  onClose: () => void;
  agentContext: Record<string, unknown>;
  onAgentContextChange: (ctx: Record<string, unknown>) => void;
}) {
  const tokens = useTokens();

  if (!detail) return null;

  const hasContextSchema = Boolean(
    detail.contextSchema?.type === "object" &&
      detail.contextSchema.properties &&
      Object.keys(detail.contextSchema.properties as object).length > 0,
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="md"
      fullWidth
      PaperProps={{
        sx: { maxHeight: "85vh" },
      }}
    >
      <DialogTitle
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          pb: 1,
        }}
      >
        <Typography variant="h6" fontWeight={600}>
          {detail.name}
        </Typography>
        <IconButton onClick={onClose} size="small">
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent dividers>
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
                maxHeight: 200,
                overflow: "auto",
              }}
            >
              {detail.system}
            </Box>
          </Box>
        )}

        {/* Agent Context */}
        {hasContextSchema && (
          <Box
            sx={{
              mb: 2,
              p: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: "8px",
              bgcolor: "action.hover",
            }}
          >
            <Typography variant="subtitle2" fontWeight={600} sx={{ mb: 0.5 }}>
              Agent Context
            </Typography>
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ display: "block", mb: 1.5 }}
            >
              These values flow to all tools and chat requests. Runtime context
              (set in code) is merged as the base.
            </Typography>
            <SchemaField
              name=""
              schema={detail.contextSchema as Record<string, unknown>}
              value={agentContext}
              onChange={(v) =>
                onAgentContextChange(v as Record<string, unknown>)
              }
            />
          </Box>
        )}

        {/* Tools */}
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          Tools ({detail.tools.length})
        </Typography>
        <Box sx={{ mt: 0.5 }}>
          {detail.tools.map((tool) => (
            <ToolSection
              key={tool.name}
              tool={tool}
              agentName={detail.name}
              agentContext={agentContext}
            />
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  );
}
