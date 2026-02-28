import { useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import type { SendEmailToolProps } from "./tools.generated";
import { ResolvedBanner } from "../components/ResolvedBanner";

export function SendEmailTool(props: SendEmailToolProps) {
  const preview = props.suspendPayload?.preview;
  // Fall back to tool args when suspend payload isn't available (e.g. after message refetch)
  const args = props.args;
  const [to, setTo] = useState(preview?.to ?? args.to ?? "");
  const [subject, setSubject] = useState(preview?.subject ?? args.subject ?? "");
  const [body, setBody] = useState(preview?.body ?? args.body ?? "");

  if (props.state === "result") {
    const resolvedTo = preview?.to ?? args.to;
    return <ResolvedBanner>Email to {resolvedTo} — Resolved</ResolvedBanner>;
  }

  return (
    <Box
      sx={{
        p: 2,
        my: 1,
        border: "1px solid #2196F3",
        borderRadius: "12px",
        bgcolor: "#E3F2FD",
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
    </Box>
  );
}
