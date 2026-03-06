import BugReportIcon from "@mui/icons-material/BugReport";
import SendIcon from "@mui/icons-material/Send";
import {
  Box,
  ButtonBase,
  IconButton,
  TextField,
  Typography,
} from "@mui/material";
import { useAgent } from "@zaikit/react";
import { Fragment, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
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
    color: "#10B981",
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
    color: "#10B981",
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

const samplePrompts = [
  {
    label: "Book a flight",
    text: "Find me flights to Tokyo on March 20th",
  },
  {
    label: "Submit an expense",
    text: "Submit a $42.50 expense for a team lunch",
  },
  {
    label: "Check the weather",
    text: "What's the weather like in Sydney?",
  },
  {
    label: "Send an email",
    text: "Draft an email to manager@acmecorp.com about the Q1 sprint review",
  },
  {
    label: "View my profile",
    text: "Show me my profile information",
  },
  {
    label: "Recent activity",
    text: "What have I been working on recently?",
  },
];

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
  const canSend = !isLoading && !!input.trim() && !hasSuspendedTools;

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
              flex: messages.length === 0 ? 1 : undefined,
            }}
          >
            {messages.length === 0 && !isLoading && (
              <Box
                sx={{
                  flex: 1,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 3,
                  py: 4,
                }}
              >
                <Typography variant="h5" fontWeight={600} color="text.primary">
                  Acme Corp Assistant
                </Typography>
                <Typography color="text.secondary" sx={{ mb: 1 }}>
                  How can I help you today?
                </Typography>
                <Box
                  sx={{
                    display: "grid",
                    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
                    gridAutoRows: "1fr",
                    gap: 1.5,
                    width: "100%",
                    maxWidth: 600,
                  }}
                >
                  {samplePrompts.map((prompt) => (
                    <ButtonBase
                      key={prompt.label}
                      onClick={() => {
                        sendMessage?.({ text: prompt.text });
                      }}
                      sx={{
                        p: 2,
                        borderRadius: "12px",
                        border: "1px solid",
                        borderColor: "divider",
                        textAlign: "left",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-start",
                        justifyContent: "flex-start",
                        gap: 0.25,
                        overflow: "hidden",
                        transition: "all 0.15s",
                        "&:hover": {
                          borderColor: "primary.main",
                          bgcolor: "action.hover",
                        },
                      }}
                    >
                      <Typography variant="body2" fontWeight={600}>
                        {prompt.label}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {prompt.text}
                      </Typography>
                    </ButtonBase>
                  ))}
                </Box>
              </Box>
            )}
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
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {part.text}
                              </ReactMarkdown>
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
                        if (rendered)
                          return <Fragment key={i}>{rendered}</Fragment>;
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
            placeholder="Type a message..."
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
            disabled={!canSend}
            sx={{
              bgcolor: canSend ? "primary.main" : "action.disabledBackground",
              color: canSend ? "#fff" : "action.disabled",
              width: 40,
              height: 40,
              "&:hover": canSend ? { bgcolor: "primary.dark" } : {},
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
