import { useState, Fragment } from "react";
import ReactMarkdown from "react-markdown";
import {
  Box,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import BugReportIcon from "@mui/icons-material/BugReport";
import { useAgent } from "@lioneltay/aikit-react";
import { DebugSidebar } from "./DebugSidebar";

const markdownStyles = {
  "& p": {
    my: "0.5em",
    "&:first-of-type": { mt: 0 },
    "&:last-of-type": { mb: 0 },
  },
  "& pre": {
    bgcolor: "#f0f0f0",
    borderRadius: "6px",
    p: "0.75rem 1rem",
    overflowX: "auto",
    my: "0.5em",
  },
  "& code": {
    fontFamily:
      '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace',
    fontSize: "0.9em",
  },
  "& :not(pre) > code": {
    bgcolor: "#f0f0f0",
    p: "0.15em 0.35em",
    borderRadius: "4px",
  },
  "& ul, & ol": { my: "0.5em", pl: "1.5em" },
  "& li": { my: "0.25em" },
  "& blockquote": {
    borderLeft: "3px solid #ccc",
    my: "0.5em",
    p: "0.25em 0.75em",
    color: "#666",
  },
  "& h1, & h2, & h3, & h4, & h5, & h6": {
    mt: "0.75em",
    mb: "0.25em",
    lineHeight: 1.3,
  },
  "& h1:first-of-type, & h2:first-of-type, & h3:first-of-type": { mt: 0 },
  "& table": { borderCollapse: "collapse", my: "0.5em", width: "100%" },
  "& th, & td": {
    border: "1px solid #ddd",
    p: "0.4em 0.75em",
    textAlign: "left",
  },
  "& th": { bgcolor: "#f5f5f5", fontWeight: 600 },
  "& hr": { border: "none", borderTop: "1px solid #ddd", my: "0.75em" },
  "& a": {
    color: "#1976d2",
    textDecoration: "none",
    "&:hover": { textDecoration: "underline" },
  },
} as const;

export function AgentChat({
  showDebug,
  onToggleDebug,
}: {
  showDebug: boolean;
  onToggleDebug: () => void;
}) {
  const {
    rawMessages,
    messages,
    sendMessage,
    status,
    hasSuspendedTools,
    renderToolPart,
  } = useAgent();
  const [input, setInput] = useState("");

  const isLoading = status === "streaming" || status === "submitted";

  // Intentional: do not remove — used to inspect message structure in browser devtools
  console.info("messages", messages);

  return (
    <Box sx={{ display: "flex", height: "100%" }}>
      <Box
        sx={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minWidth: 0,
        }}
      >
        <Box
          sx={{
            flex: 1,
            overflowY: "auto",
            p: 2,
            display: "flex",
            flexDirection: "column",
            gap: 1.5,
          }}
        >
          {messages.map((message) => (
            <Box
              key={message.id}
              sx={{
                p: 1.5,
                borderRadius: 2,
                bgcolor:
                  message.role === "user" ? "primary.50" : "background.paper",
                boxShadow: 1,
              }}
            >
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mb: 0.5 }}
              >
                {message.role === "user" ? "You" : "Assistant"}
              </Typography>
              <div>
                {message.parts.map((part, i) => {
                  if (part.type === "text") {
                    if (message.role === "assistant") {
                      return (
                        <Box key={i} sx={markdownStyles}>
                          <ReactMarkdown>{part.text}</ReactMarkdown>
                        </Box>
                      );
                    }
                    return <Typography key={i}>{part.text}</Typography>;
                  }
                  if (
                    part.type === "dynamic-tool" ||
                    part.type.startsWith("tool-")
                  ) {
                    const rendered = renderToolPart(part);
                    if (rendered) return <Fragment key={i}>{rendered}</Fragment>;
                    return (
                      <Typography
                        key={i}
                        component="pre"
                        variant="body2"
                        sx={{ color: "text.secondary" }}
                      >
                        Tool: {(part as any).toolName ?? (part as any).type}
                      </Typography>
                    );
                  }
                  if (part.type === "source-url") {
                    return (
                      <Typography
                        key={i}
                        component="a"
                        href={part.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        color="primary"
                      >
                        {part.title || part.url}
                      </Typography>
                    );
                  }
                  return null;
                })}
              </div>
            </Box>
          ))}
          {isLoading && (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                gap: 1,
                p: 1,
                color: "text.secondary",
              }}
            >
              <CircularProgress size={16} />
              <Typography variant="body2" fontStyle="italic">
                Thinking...
              </Typography>
            </Box>
          )}
        </Box>

        <Box
          component="form"
          onSubmit={(e) => {
            e.preventDefault();
            if (!input.trim() || !sendMessage) return;
            sendMessage({ text: input });
            setInput("");
          }}
          sx={{
            display: "flex",
            gap: 1,
            p: 2,
            borderTop: 1,
            borderColor: "divider",
            bgcolor: "background.paper",
          }}
        >
          <TextField
            fullWidth
            size="small"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              hasSuspendedTools
                ? "Resolve pending actions first..."
                : "Type a message..."
            }
            disabled={isLoading || hasSuspendedTools}
            autoFocus
          />
          <IconButton
            type="submit"
            color="primary"
            disabled={isLoading || !input.trim() || hasSuspendedTools}
          >
            <SendIcon />
          </IconButton>
          <IconButton
            onClick={onToggleDebug}
            color={showDebug ? "primary" : "default"}
            title="Toggle debug sidebar"
          >
            <BugReportIcon />
          </IconButton>
        </Box>
      </Box>

      {showDebug && (
        <DebugSidebar rawMessages={rawMessages} messages={messages} />
      )}
    </Box>
  );
}
