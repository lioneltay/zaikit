import { Box, Button, TextField, Typography } from "@mui/material";
import { useEffect, useState } from "react";
import { ResolvedBanner } from "../components/ResolvedBanner";
import type { SendEmailToolProps } from "../generated/generated";

export function SendEmailTool(props: SendEmailToolProps) {
  const preview = props.suspendPayload?.preview;
  const args = props.args;
  const defaults = {
    to: preview?.to ?? args.to ?? "",
    subject: preview?.subject ?? args.subject ?? "",
    body: preview?.body ?? args.body ?? "",
  };
  const [to, setTo] = useState(defaults.to);
  const [subject, setSubject] = useState(defaults.subject);
  const [body, setBody] = useState(defaults.body);

  // Sync state when suspend payload arrives (useState initializer only runs once)
  useEffect(() => {
    if (defaults.to) setTo(defaults.to);
    if (defaults.subject) setSubject(defaults.subject);
    if (defaults.body) setBody(defaults.body);
  }, [defaults.to, defaults.subject, defaults.body]);

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
