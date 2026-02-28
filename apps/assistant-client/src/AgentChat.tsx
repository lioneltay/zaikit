import { useState, Fragment } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Box, TextField, IconButton, Typography } from "@mui/material";
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
    bgcolor: "#1e1e1e",
    color: "#d4d4d4",
    borderRadius: "8px",
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
    bgcolor: "#f0f0f3",
    color: "#6C63FF",
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
    color: "#6C63FF",
    textDecoration: "none",
    "&:hover": { textDecoration: "underline" },
  },
} as const;

const thinkingDots = {
  "@keyframes dotPulse": {
    "0%, 80%, 100%": { opacity: 0 },
    "40%": { opacity: 1 },
  },
  display: "inline-flex",
  gap: "4px",
  "& span": {
    width: 6,
    height: 6,
    borderRadius: "50%",
    bgcolor: "text.disabled",
    animation: "dotPulse 1.4s infinite ease-in-out",
  },
  "& span:nth-of-type(2)": { animationDelay: "0.2s" },
  "& span:nth-of-type(3)": { animationDelay: "0.4s" },
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
            display: "flex",
            flexDirection: "column",
          }}
        >
          <Box
            sx={{
              width: "100%",
              maxWidth: 768,
              mx: "auto",
              px: 3,
              py: 3,
              display: "flex",
              flexDirection: "column",
              gap: 3,
            }}
          >
            {messages.map((message) => {
              const isUser = message.role === "user";
              return (
                <Box
                  key={message.id}
                  sx={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: isUser ? "flex-end" : "flex-start",
                  }}
                >
                  <Box
                    sx={{
                      maxWidth: isUser ? "85%" : "100%",
                      width: isUser ? undefined : "100%",
                      ...(isUser
                        ? {
                            bgcolor: "primary.main",
                            color: "#fff",
                            borderRadius: "16px 16px 4px 16px",
                            px: 2,
                            py: 1.5,
                          }
                        : {}),
                    }}
                  >
                    {message.parts.map((part, i) => {
                      if (part.type === "text") {
                        if (!isUser) {
                          return (
                            <Box key={i} sx={markdownStyles}>
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
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
                  </Box>
                </Box>
              );
            })}
            {isLoading && (
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  gap: 1.5,
                  py: 1,
                }}
              >
                <Box sx={thinkingDots}>
                  <span />
                  <span />
                  <span />
                </Box>
                <Typography
                  variant="body2"
                  sx={{ color: "text.disabled", fontStyle: "italic" }}
                >
                  Thinking...
                </Typography>
              </Box>
            )}
          </Box>
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
            alignItems: "center",
            gap: 1,
            maxWidth: 768,
            width: "100%",
            mx: "auto",
            px: 3,
            pb: 2,
            pt: 1,
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
            sx={{
              "& .MuiOutlinedInput-root": {
                borderRadius: "24px",
                bgcolor: "background.paper",
                boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
                "& fieldset": { borderColor: "transparent" },
                "&:hover fieldset": { borderColor: "transparent" },
                "&.Mui-focused fieldset": {
                  borderColor: "primary.main",
                  borderWidth: 1,
                },
              },
              "& .MuiInputBase-input::placeholder": {
                color: "#999",
                opacity: 1,
              },
            }}
          />
          <IconButton
            type="submit"
            disabled={isLoading || !input.trim() || hasSuspendedTools}
            sx={{
              bgcolor:
                !isLoading && input.trim() && !hasSuspendedTools
                  ? "primary.main"
                  : "action.disabledBackground",
              color:
                !isLoading && input.trim() && !hasSuspendedTools
                  ? "#fff"
                  : "action.disabled",
              width: 40,
              height: 40,
              "&:hover": {
                bgcolor: "primary.dark",
              },
              "&.Mui-disabled": {
                bgcolor: "action.disabledBackground",
                color: "action.disabled",
              },
            }}
          >
            <SendIcon sx={{ fontSize: 20 }} />
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
