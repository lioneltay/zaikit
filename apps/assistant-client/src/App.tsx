import { useState, useEffect, useMemo, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
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
} from "@mui/material";
import SendIcon from "@mui/icons-material/Send";
import ConversationList from "./ConversationList";
import { trpc } from "./trpc";
import type { Thread } from "./trpc";

const DRAWER_WIDTH = 280;

const markdownStyles = {
  "& p": { my: "0.5em", "&:first-of-type": { mt: 0 }, "&:last-of-type": { mb: 0 } },
  "& pre": { bgcolor: "#f0f0f0", borderRadius: "6px", p: "0.75rem 1rem", overflowX: "auto", my: "0.5em" },
  "& code": { fontFamily: '"SF Mono", "Fira Code", "Fira Mono", Menlo, Consolas, monospace', fontSize: "0.9em" },
  "& :not(pre) > code": { bgcolor: "#f0f0f0", p: "0.15em 0.35em", borderRadius: "4px" },
  "& ul, & ol": { my: "0.5em", pl: "1.5em" },
  "& li": { my: "0.25em" },
  "& blockquote": { borderLeft: "3px solid #ccc", my: "0.5em", p: "0.25em 0.75em", color: "#666" },
  "& h1, & h2, & h3, & h4, & h5, & h6": { mt: "0.75em", mb: "0.25em", lineHeight: 1.3 },
  "& h1:first-of-type, & h2:first-of-type, & h3:first-of-type": { mt: 0 },
  "& table": { borderCollapse: "collapse", my: "0.5em", width: "100%" },
  "& th, & td": { border: "1px solid #ddd", p: "0.4em 0.75em", textAlign: "left" },
  "& th": { bgcolor: "#f5f5f5", fontWeight: 600 },
  "& hr": { border: "none", borderTop: "1px solid #ddd", my: "0.75em" },
  "& a": { color: "#1976d2", textDecoration: "none", "&:hover": { textDecoration: "underline" } },
} as const;

function ChatView({
  threadId,
  initialMessages,
  onResponseComplete,
}: {
  threadId: string;
  initialMessages: UIMessage[];
  onResponseComplete?: () => void;
}) {
  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: "http://localhost:7301/api/chat",
        prepareSendMessagesRequest: ({ messages }) => {
          const lastMessage = messages[messages.length - 1];
          return { body: { threadId, message: lastMessage } };
        },
      }),
    [threadId],
  );

  const { messages, sendMessage, status } = useChat({
    transport,
    messages: initialMessages,
    onFinish: () => onResponseComplete?.(),
  });
  const [input, setInput] = useState("");

  const isLoading = status === "streaming" || status === "submitted";

  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ flex: 1, overflowY: "auto", p: 2, display: "flex", flexDirection: "column", gap: 1.5 }}>
        {messages.map((message) => (
          <Box
            key={message.id}
            sx={{
              p: 1.5,
              borderRadius: 2,
              bgcolor: message.role === "user" ? "primary.50" : "background.paper",
              boxShadow: 1,
            }}
          >
            <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 0.5 }}>
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
                if (part.type === "dynamic-tool") {
                  return (
                    <Typography key={i} component="pre" variant="body2" sx={{ color: "text.secondary" }}>
                      Tool: {part.toolName}
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
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, p: 1, color: "text.secondary" }}>
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
          if (!input.trim()) return;
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
          placeholder="Type a message..."
          disabled={isLoading}
          autoFocus
        />
        <IconButton type="submit" color="primary" disabled={isLoading || !input.trim()}>
          <SendIcon />
        </IconButton>
      </Box>
    </Box>
  );
}

export default function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [initialMessages, setInitialMessages] = useState<UIMessage[]>([]);
  const initialThreadId = useRef(new URLSearchParams(window.location.search).get("threadId"));

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

        <Box component="main" sx={{ flex: 1, display: "flex", flexDirection: "column" }}>
          {activeThreadId ? (
            <ChatView
              key={activeThreadId}
              threadId={activeThreadId}
              initialMessages={initialMessages}
              onResponseComplete={async () => {
                setThreads(await trpc.thread.list.query());
              }}
            />
          ) : (
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
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
