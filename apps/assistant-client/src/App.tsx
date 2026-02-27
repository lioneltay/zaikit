import { useState, useEffect, useRef, useMemo, memo } from "react";
import type { UIMessage } from "ai";
import ReactMarkdown from "react-markdown";
import {
  Box,
  Drawer,
  TextField,
  IconButton,
  Typography,
  CircularProgress,
  CssBaseline,
  Button,
  Paper,
  Tab,
  Tabs,
  Chip,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import BugReportIcon from "@mui/icons-material/BugReport";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ConversationList from "./ConversationList";
import { trpc } from "./trpc";
import type { Thread } from "./trpc";
import { useAgentChat } from "./useAgentChat";

const DRAWER_WIDTH = 280;

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

type SuspendData = {
  toolCallId: string;
  toolName: string;
  payload: { message: string };
};

function SuspendUI({
  data,
  resolved,
  onResume,
}: {
  data: SuspendData;
  resolved: boolean;
  onResume: (toolCallId: string, data: unknown) => void;
}) {
  if (resolved) {
    return (
      <Paper
        elevation={1}
        sx={{
          p: 2,
          my: 1,
          border: "1px solid",
          borderColor: "success.light",
          bgcolor: "success.50",
        }}
      >
        <Typography variant="body2" color="text.secondary">
          {data.payload.message} — Resolved
        </Typography>
      </Paper>
    );
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
        {data.payload.message}
      </Typography>
      <Box sx={{ display: "flex", gap: 1 }}>
        <Button
          variant="contained"
          color="success"
          size="small"
          onClick={() => onResume(data.toolCallId, { approved: true })}
        >
          Approve
        </Button>
        <Button
          variant="outlined"
          color="error"
          size="small"
          onClick={() => onResume(data.toolCallId, { approved: false })}
        >
          Deny
        </Button>
      </Box>
    </Paper>
  );
}

const DEBUG_WIDTH = 480;

// --- Debug sidebar theme constants ---

const jsonColors = {
  key: "#9cdcfe",
  string: "#ce9178",
  number: "#b5cea8",
  boolean: "#569cd6",
  null: "#569cd6",
  bracket: "#808080",
  punctuation: "#808080",
} as const;

const partTypeColors: Record<string, { bg: string; fg: string }> = {
  text: { bg: "#2e7d32", fg: "#fff" },
  "step-start": { bg: "#616161", fg: "#fff" },
  tool: { bg: "#1565c0", fg: "#fff" },
  "dynamic-tool": { bg: "#7b1fa2", fg: "#fff" },
  data: { bg: "#e65100", fg: "#fff" },
  "source-url": { bg: "#00695c", fg: "#fff" },
};

function getPartColor(type: string): { bg: string; fg: string } {
  if (partTypeColors[type]) return partTypeColors[type];
  if (type.startsWith("tool-")) return partTypeColors["tool"];
  if (type.startsWith("data-")) return partTypeColors["data"];
  return { bg: "#616161", fg: "#fff" };
}

// --- JSON rendering components ---

function JsonLine({
  indent,
  keyName,
  children,
}: {
  indent: number;
  keyName?: string | number;
  children: React.ReactNode;
}) {
  return (
    <Box component="div" sx={{ pl: `${indent * 14}px`, lineHeight: 1.6 }}>
      {keyName !== undefined && (
        <>
          <Box component="span" sx={{ color: typeof keyName === "number" ? jsonColors.number : jsonColors.key }}>
            {typeof keyName === "string" ? `"${keyName}"` : keyName}
          </Box>
          <Box component="span" sx={{ color: jsonColors.punctuation }}>
            :{" "}
          </Box>
        </>
      )}
      {children}
    </Box>
  );
}

const JsonValue = memo(function JsonValue({
  data,
  indentLevel = 0,
  keyName,
  defaultExpanded: forceExpanded = false,
}: {
  data: unknown;
  indentLevel?: number;
  keyName?: string | number;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(forceExpanded);

  if (data === null) {
    return (
      <JsonLine indent={indentLevel} keyName={keyName}>
        <Box component="span" sx={{ color: jsonColors.null }}>null</Box>
      </JsonLine>
    );
  }

  if (typeof data === "boolean") {
    return (
      <JsonLine indent={indentLevel} keyName={keyName}>
        <Box component="span" sx={{ color: jsonColors.boolean }}>{String(data)}</Box>
      </JsonLine>
    );
  }

  if (typeof data === "number") {
    return (
      <JsonLine indent={indentLevel} keyName={keyName}>
        <Box component="span" sx={{ color: jsonColors.number }}>{data}</Box>
      </JsonLine>
    );
  }

  if (typeof data === "string") {
    const display = data.length > 120 ? data.slice(0, 117) + "..." : data;
    return (
      <JsonLine indent={indentLevel} keyName={keyName}>
        <Box component="span" sx={{ color: jsonColors.string }}>"{display}"</Box>
      </JsonLine>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return (
        <JsonLine indent={indentLevel} keyName={keyName}>
          <Box component="span" sx={{ color: jsonColors.bracket }}>[]</Box>
        </JsonLine>
      );
    }

    const autoExpand = data.length <= 3;
    const isOpen = autoExpand || expanded;

    if (!isOpen) {
      return (
        <JsonLine indent={indentLevel} keyName={keyName}>
          <Box
            component="span"
            onClick={() => setExpanded(true)}
            sx={{ color: jsonColors.bracket, cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
          >
            [{`...${data.length} items`}]
          </Box>
        </JsonLine>
      );
    }

    return (
      <>
        <JsonLine indent={indentLevel} keyName={keyName}>
          <Box
            component="span"
            onClick={autoExpand ? undefined : () => setExpanded(false)}
            sx={{ color: jsonColors.bracket, cursor: autoExpand ? "default" : "pointer" }}
          >
            [
          </Box>
        </JsonLine>
        {data.map((item, i) => (
          <JsonValue key={i} data={item} indentLevel={indentLevel + 1} keyName={i} />
        ))}
        <JsonLine indent={indentLevel}>
          <Box component="span" sx={{ color: jsonColors.bracket }}>]</Box>
        </JsonLine>
      </>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);

    if (entries.length === 0) {
      return (
        <JsonLine indent={indentLevel} keyName={keyName}>
          <Box component="span" sx={{ color: jsonColors.bracket }}>{"{}"}</Box>
        </JsonLine>
      );
    }

    const autoExpand = entries.length <= 3;
    const isOpen = autoExpand || expanded;

    if (!isOpen) {
      return (
        <JsonLine indent={indentLevel} keyName={keyName}>
          <Box
            component="span"
            onClick={() => setExpanded(true)}
            sx={{ color: jsonColors.bracket, cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
          >
            {`{...${entries.length} entries}`}
          </Box>
        </JsonLine>
      );
    }

    return (
      <>
        <JsonLine indent={indentLevel} keyName={keyName}>
          <Box
            component="span"
            onClick={autoExpand ? undefined : () => setExpanded(false)}
            sx={{ color: jsonColors.bracket, cursor: autoExpand ? "default" : "pointer" }}
          >
            {"{"}
          </Box>
        </JsonLine>
        {entries.map(([k, v]) => (
          <JsonValue key={k} data={v} indentLevel={indentLevel + 1} keyName={k} />
        ))}
        <JsonLine indent={indentLevel}>
          <Box component="span" sx={{ color: jsonColors.bracket }}>{"}"}</Box>
        </JsonLine>
      </>
    );
  }

  // Fallback for undefined or other types
  return (
    <JsonLine indent={indentLevel} keyName={keyName}>
      <Box component="span" sx={{ color: jsonColors.string }}>{String(data)}</Box>
    </JsonLine>
  );
});

function PartItem({ part, index }: { part: Record<string, unknown>; index: number }) {
  const type = (part.type as string) || "unknown";
  const color = getPartColor(type);

  // Build preview text
  let preview = "";
  if (type === "text" && typeof part.text === "string") {
    preview = part.text.length > 60 ? part.text.slice(0, 57) + "..." : part.text;
  } else if (typeof part.toolName === "string") {
    preview = part.toolName;
  }

  // Show all fields except `type` in the JSON viewer (type is already in the chip)
  const { type: _type, ...rest } = part;

  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        bgcolor: "#2d2d2d",
        borderLeft: `3px solid ${color.bg}`,
        "&:before": { display: "none" },
        "&:not(:last-child)": { mb: "2px" },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ color: "#808080", fontSize: 16 }} />}
        sx={{
          minHeight: 32,
          px: 1,
          "& .MuiAccordionSummary-content": { my: 0.5, alignItems: "center", gap: 1, minWidth: 0 },
        }}
      >
        <Chip
          label={type}
          size="small"
          sx={{
            bgcolor: color.bg,
            color: color.fg,
            fontSize: "0.65rem",
            height: 20,
            flexShrink: 0,
          }}
        />
        {preview && (
          <Typography
            variant="caption"
            sx={{
              color: "#999",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "0.65rem",
            }}
          >
            {preview}
          </Typography>
        )}
      </AccordionSummary>
      <AccordionDetails sx={{ p: 1, pt: 0 }}>
        <Box sx={{ fontFamily: "monospace", fontSize: "0.7rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          <JsonValue data={rest} defaultExpanded />
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}

const MessageCard = memo(function MessageCard({
  message,
  index,
}: {
  message: { id: string; role: string; parts: Record<string, unknown>[] };
  index: number;
}) {
  const roleColor = message.role === "user" ? "primary" : "secondary";
  const truncatedId = message.id.length > 8 ? message.id.slice(0, 8) + "..." : message.id;

  return (
    <Paper
      variant="outlined"
      sx={{
        bgcolor: "#252526",
        borderColor: "#3e3e42",
        mb: 1,
        overflow: "hidden",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 1, py: 0.5, borderBottom: "1px solid #3e3e42" }}>
        <Chip label={message.role} color={roleColor} size="small" sx={{ fontSize: "0.65rem", height: 20 }} />
        <Typography variant="caption" sx={{ color: "#808080", fontSize: "0.65rem" }}>
          #{index}
        </Typography>
        <Typography variant="caption" sx={{ color: "#606060", fontSize: "0.6rem", fontFamily: "monospace" }}>
          {truncatedId}
        </Typography>
        <Typography variant="caption" sx={{ color: "#606060", fontSize: "0.6rem", ml: "auto" }}>
          {message.parts.length} part{message.parts.length !== 1 ? "s" : ""}
        </Typography>
      </Box>
      <Box sx={{ p: 0.5 }}>
        {message.parts.map((part, i) => (
          <PartItem key={i} part={part} index={i} />
        ))}
      </Box>
    </Paper>
  );
});

function DebugSidebar({
  rawMessages,
  messages,
}: {
  rawMessages: UIMessage[];
  messages: UIMessage[];
}) {
  const [tab, setTab] = useState(0);
  const data = tab === 0 ? rawMessages : messages;

  const stripped = useMemo(
    () =>
      data.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts.map((p) => {
          const { ...rest } = p as any;
          delete rest.callProviderMetadata;
          delete rest.providerMetadata;
          return rest;
        }),
      })),
    [data],
  );

  return (
    <Box
      sx={{
        width: DEBUG_WIDTH,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid #3e3e42",
        bgcolor: "#1e1e1e",
        color: "#d4d4d4",
      }}
    >
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{
          borderBottom: "1px solid #3e3e42",
          minHeight: 36,
          bgcolor: "#252526",
          "& .MuiTab-root": { color: "#808080", minHeight: 36, py: 0, fontSize: "0.75rem" },
          "& .Mui-selected": { color: "#d4d4d4 !important" },
          "& .MuiTabs-indicator": { bgcolor: "#007acc" },
        }}
      >
        <Tab label="Raw" />
        <Tab label="Transformed" />
      </Tabs>
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 1,
          "&::-webkit-scrollbar": { width: 8 },
          "&::-webkit-scrollbar-track": { bgcolor: "#1e1e1e" },
          "&::-webkit-scrollbar-thumb": { bgcolor: "#424242", borderRadius: 4 },
        }}
      >
        {stripped.map((msg, i) => (
          <MessageCard key={msg.id + tab} message={msg} index={i} />
        ))}
      </Box>
    </Box>
  );
}

function ChatView({
  threadId,
  initialMessages,
  showDebug,
  onToggleDebug,
  onResponseComplete,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  showDebug: boolean;
  onToggleDebug: () => void;
  onResponseComplete?: () => void;
}) {
  const {
    rawMessages,
    messages,
    sendMessage,
    status,
    resumeTool,
    hasSuspendedTools,
  } = useAgentChat({
    threadId,
    initialMessages,
    onFinish: () => onResponseComplete?.(),
  });
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
                    const toolPart = part as any;
                    if (toolPart.suspend) {
                      return (
                        <SuspendUI
                          key={i}
                          data={toolPart.suspend as SuspendData}
                          resolved={toolPart.state === "output-available"}
                          onResume={resumeTool}
                        />
                      );
                    }
                    return (
                      <Typography
                        key={i}
                        component="pre"
                        variant="body2"
                        sx={{ color: "text.secondary" }}
                      >
                        Tool: {toolPart.toolName ?? toolPart.type}
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

export default function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const [showDebug, setShowDebug] = useState(false);
  const initialThreadId = useRef(
    new URLSearchParams(window.location.search).get("threadId"),
  );

  // Persist activeThreadId in URL
  useEffect(() => {
    const url = new URL(window.location.href);
    if (activeThreadId) {
      url.searchParams.set("threadId", activeThreadId);
    } else {
      url.searchParams.delete("threadId");
    }
    history.replaceState(null, "", url.toString());
  }, [activeThreadId]);

  // Load threads and auto-select from URL
  useEffect(() => {
    trpc.thread.list.query().then((loadedThreads) => {
      setThreads(loadedThreads);
      const urlThreadId = initialThreadId.current;
      if (urlThreadId && loadedThreads.some((t) => t.id === urlThreadId)) {
        handleSelectThread(urlThreadId);
      }
    });
  }, []);

  const handleCreateThread = () => {
    const id = crypto.randomUUID();
    setActiveThreadId(id);
    setInitialMessages([]);
  };

  const handleDeleteThread = async (id: string) => {
    await trpc.thread.delete.mutate({ id });
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (activeThreadId === id) {
      setActiveThreadId(null);
      setInitialMessages([]);
    }
  };

  const handleSelectThread = async (id: string) => {
    const msgs = await trpc.thread.getMessages.query({ threadId: id });
    // tRPC serialization makes some required UIMessage properties optional,
    // creating a structural mismatch with the AI SDK's UIMessage type.
    setInitialMessages(msgs as unknown as UIMessage[]);
    setActiveThreadId(id);
  };

  return (
    <>
      <CssBaseline />
      <Box sx={{ display: "flex", height: "100vh" }}>
        <Drawer
          variant="permanent"
          sx={{
            width: DRAWER_WIDTH,
            flexShrink: 0,
            "& .MuiDrawer-paper": {
              width: DRAWER_WIDTH,
              boxSizing: "border-box",
            },
          }}
        >
          <ConversationList
            threads={threads}
            activeThreadId={activeThreadId}
            onSelect={handleSelectThread}
            onCreate={handleCreateThread}
            onDelete={handleDeleteThread}
          />
        </Drawer>

        <Box
          component="main"
          sx={{ flex: 1, display: "flex", flexDirection: "column" }}
        >
          {activeThreadId ? (
            <ChatView
              key={activeThreadId}
              threadId={activeThreadId}
              initialMessages={initialMessages}
              showDebug={showDebug}
              onToggleDebug={() => setShowDebug((v) => !v)}
              onResponseComplete={async () => {
                setThreads(await trpc.thread.list.query());
              }}
            />
          ) : (
            <Box
              sx={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
              }}
            >
              <Typography color="text.secondary">
                Select a conversation or create a new one
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </>
  );
}
