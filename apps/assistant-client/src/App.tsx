import { useState, useEffect, useRef } from "react";
import type { UIMessage } from "ai";
import { Box, Drawer, Typography, CssBaseline } from "@mui/material";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import { AgentProvider } from "@lioneltay/aikit-react";
import ConversationList from "./ConversationList";
import { trpc } from "./trpc";
import type { Thread } from "./trpc";
import { ToolRenderers } from "./tools";
import { AgentChat } from "./AgentChat";

const DRAWER_WIDTH = 280;

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
              bgcolor: "#202123",
              borderRight: "1px solid #393b40",
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
            <AgentProvider
              key={activeThreadId}
              api="http://localhost:7301/api/chat"
              threadId={activeThreadId}
              initialMessages={initialMessages}
              fetchMessages={(threadId) =>
                trpc.thread.getMessages.query({ threadId }) as unknown as Promise<UIMessage[]>
              }
              onFinish={async () => {
                setThreads(await trpc.thread.list.query());
              }}
            >
              <ToolRenderers />
              <AgentChat
                showDebug={showDebug}
                onToggleDebug={() => setShowDebug((v) => !v)}
              />
            </AgentProvider>
          ) : (
            <Box
              sx={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                height: "100%",
                gap: 2,
              }}
            >
              <ChatBubbleOutlineIcon
                sx={{ fontSize: 64, color: "text.disabled" }}
              />
              <Typography color="text.secondary" sx={{ fontSize: 16 }}>
                Select a conversation or start a new one
              </Typography>
            </Box>
          )}
        </Box>
      </Box>
    </>
  );
}
