import { useState } from "react";
import { Box, Button, Paper, TextField, Typography } from "@mui/material";
import type { ToolRenderProps } from "@lioneltay/aikit-react";
import { ResolvedBanner } from "../components/ResolvedBanner";

export function SendEmailTool(props: ToolRenderProps) {
  const preview = (
    props.suspendPayload as
      | { preview?: { to: string; subject: string; body: string } }
      | undefined
  )?.preview;
  const [to, setTo] = useState(preview?.to ?? "");
  const [subject, setSubject] = useState(preview?.subject ?? "");
  const [body, setBody] = useState(preview?.body ?? "");

  if (props.state === "result") {
    return <ResolvedBanner>Email to {preview?.to} — Resolved</ResolvedBanner>;
  }

  return (
    <Paper
      elevation={2}
      sx={{
        p: 2,
        my: 1,
        border: "1px solid",
        borderColor: "info.light",
        bgcolor: "info.50",
      }}
    >
      <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5 }}>
        Email Preview
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1.5, mb: 2 }}>
        <TextField
          label="To"
          size="small"
          fullWidth
          value={to}
          onChange={(e) => setTo(e.target.value)}
        />
        <TextField
          label="Subject"
          size="small"
          fullWidth
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
        />
        <TextField
          label="Body"
          size="small"
          fullWidth
          multiline
          minRows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </Box>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button
          variant="contained"
          size="small"
          onClick={() => props.resume({ approved: true, to, subject, body })}
        >
          Send
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
    </Paper>
  );
}
