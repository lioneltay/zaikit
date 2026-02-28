import { Box, Button, Typography } from "@mui/material";
import type { DeleteRecordsToolProps } from "./tools.generated";
import { ResolvedBanner } from "../components/ResolvedBanner";

export function ApprovalTool(props: DeleteRecordsToolProps) {
  const message = props.suspendPayload?.message ?? "Confirm?";

  if (props.state === "result") {
    return <ResolvedBanner>{message} — Resolved</ResolvedBanner>;
  }

  return (
    <Box
      sx={{
        p: 2,
        my: 1,
        border: "1px solid #FF9800",
        borderRadius: "12px",
        bgcolor: "#FFF3E0",
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
    </Box>
  );
}
