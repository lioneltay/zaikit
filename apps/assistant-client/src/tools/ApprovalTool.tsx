import { Box, Button, Paper, Typography } from "@mui/material";
import type { ToolRenderProps } from "@lioneltay/aikit-react";
import { ResolvedBanner } from "../components/ResolvedBanner";

export function ApprovalTool(props: ToolRenderProps) {
  const message =
    (props.suspendPayload as { message?: string } | undefined)?.message ??
    "Confirm?";

  if (props.state === "result") {
    return <ResolvedBanner>{message} — Resolved</ResolvedBanner>;
  }

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        my: 1,
        border: "1px solid",
        borderColor: "warning.light",
        bgcolor: "warning.50",
      }}
    >
      <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
        Action Required
      </Typography>
      <Typography variant="body2" sx={{ mb: 2 }}>
        {message}
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button
          variant="contained"
          color="success"
          size="small"
          onClick={() => props.resume({ approved: true })}
        >
          Approve
        </Button>
        <Button
          variant="outlined"
          color="error"
          size="small"
          onClick={() => props.resume({ approved: false })}
        >
          Deny
        </Button>
      </Box>
    </Paper>
  );
}
