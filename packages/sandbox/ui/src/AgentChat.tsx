import BugReportIcon from "@mui/icons-material/BugReport";
import InfoIcon from "@mui/icons-material/Info";
import SendIcon from "@mui/icons-material/Send";
import { Box, IconButton, TextField, Typography } from "@mui/material";
import { useAgent } from "@zaikit/react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { AgentDetail } from "./api";
import { DebugSidebar } from "./DebugSidebar";
import { GenericToolCard } from "./GenericToolCard";
import { type Tokens, useTokens } from "./theme";

function getMarkdownStyles(tokens: Tokens) {
  return {
    "& p": {
      my: "0.5em",
      "&:first-of-type": { mt: 0 },
      "&:last-of-type": { mb: 0 },
    },
    "& pre": {
      bgcolor: tokens.code.preBg,
      color: tokens.code.preColor,
      borderRadius: "8px",
      p: "0.75rem 1rem",
      overflowX: "auto",
      my: "0.5em",
    },
    "& code": {
      fontFamily: '"SF Mono", "Fira Code", Menlo, Consolas, monospace',
      fontSize: "0.9em",
    },
    "& :not(pre) > code": {
      bgcolor: tokens.code.inlineBg,
      color: tokens.code.inlineColor,
      p: "0.15em 0.35em",
      borderRadius: "4px",
    },
    "& ul, & ol": { my: "0.5em", pl: "1.5em" },
    "& li": { my: "0.25em" },
    "& blockquote": {
      borderLeft: `3px solid ${tokens.markdown.blockquoteBorder}`,
      my: "0.5em",
      p: "0.25em 0.75em",
      color: tokens.markdown.blockquoteColor,
    },
    "& table": { borderCollapse: "collapse", my: "0.5em", width: "100%" },
    "& th, & td": {
      border: `1px solid ${tokens.markdown.tableBorder}`,
      p: "0.4em 0.75em",
    },
    "& th": { bgcolor: tokens.markdown.tableHeaderBg, fontWeight: 600 },
  } as const;
}

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

const remarkPlugins = [remarkGfm];

export function AgentChat({
  agentName,
  agentDetail,
  showDebug,
  onToggleDebug,
  showInfo,
  onToggleInfo,
}: {
  agentName: string;
  agentDetail: AgentDetail | null;
  showDebug: boolean;
  onToggleDebug: () => void;
  showInfo: boolean;
  onToggleInfo: () => void;
}) {
  const tokens = useTokens();
  const markdownStyles = useMemo(() => getMarkdownStyles(tokens), [tokens]);

  const { rawMessages, messages, sendMessage, status, hasSuspendedTools } =
    useAgent();
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLoading = status === "streaming" || status === "submitted";
  const canSend = !isLoading && !!input.trim() && !hasSuspendedTools;

  const resumeSchemaMap = useMemo(() => {
    const map = new Map<string, Record<string, unknown>>();
    if (agentDetail) {
      for (const tool of agentDetail.tools) {
        if (tool.resumeSchema) {
          map.set(tool.name, tool.resumeSchema);
        }
      }
    }
    return map;
  }, [agentDetail]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: intentional auto-scroll on message changes
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, isLoading]);

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
        {/* Header */}
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            px: 3,
            py: 1,
            borderBottom: "1px solid",
            borderColor: "divider",
          }}
        >
          <Typography variant="subtitle1" fontWeight={600}>
            {agentName}
          </Typography>
          <Box>
            <IconButton
              onClick={onToggleInfo}
              color={showInfo ? "primary" : "default"}
              title="Agent info"
              size="small"
            >
              <InfoIcon />
            </IconButton>
            <IconButton
              onClick={onToggleDebug}
              color={showDebug ? "primary" : "default"}
              title="Debug inspector"
              size="small"
            >
              <BugReportIcon />
            </IconButton>
          </Box>
        </Box>

        {/* Messages */}
        <Box
          ref={scrollRef}
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
                              <ReactMarkdown remarkPlugins={remarkPlugins}>
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
                        const toolName =
                          (part as any).toolName ??
                          (part.type.startsWith("tool-")
                            ? part.type.slice(5)
                            : undefined);
                        return (
                          <Fragment key={i}>
                            <GenericToolCard
                              part={part as any}
                              resumeSchema={
                                toolName
                                  ? resumeSchemaMap.get(toolName)
                                  : undefined
                              }
                            />
                          </Fragment>
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

        {/* Input */}
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
        </Box>
      </Box>

      {showDebug && (
        <DebugSidebar rawMessages={rawMessages} messages={messages} />
      )}
    </Box>
  );
}
