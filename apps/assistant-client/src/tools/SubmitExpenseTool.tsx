import { Box, Button, Chip, Typography } from "@mui/material";
import { ResolvedBanner } from "../components/ResolvedBanner";
import type { SubmitExpenseToolProps } from "../generated/generated";

export function SubmitExpenseTool(props: SubmitExpenseToolProps) {
  const summary = props.suspendPayload?.summary;
  const message = props.suspendPayload?.message ?? "Submit this expense?";

  if (props.state === "result") {
    return <ResolvedBanner>Expense claim — Resolved</ResolvedBanner>;
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
        Expense Claim
      </Typography>
      {summary && (
        <Box
          sx={{ mb: 1.5, display: "flex", flexDirection: "column", gap: 0.5 }}
        >
          <Typography variant="body2">{summary.description}</Typography>
          <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
            <Typography variant="body2" fontWeight={600}>
              ${summary.amount.toFixed(2)}
            </Typography>
            <Chip label={summary.category} size="small" variant="outlined" />
          </Box>
        </Box>
      )}
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        {message}
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button
          variant="contained"
          color="success"
          size="small"
          onClick={() => props.resume({ approved: true })}
        >
          Submit
        </Button>
        <Button
          variant="outlined"
          color="error"
          size="small"
          onClick={() => props.resume({ approved: false })}
        >
          Cancel
        </Button>
      </Box>
    </Box>
  );
}
