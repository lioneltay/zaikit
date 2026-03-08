import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import MenuIcon from "@mui/icons-material/Menu";
import {
  Box,
  CssBaseline,
  Drawer,
  IconButton,
  Typography,
} from "@mui/material";
import { AgentProvider } from "@zaikit/react";
import { DevTools } from "@zaikit/sandbox/devtools";
import type { UIMessage } from "ai";
import { useEffect, useRef, useState } from "react";
import { AgentChat } from "./AgentChat";
import ConversationList from "./ConversationList";
import { ToolRenderers } from "./tools";
import type { Thread } from "./trpc";
import { trpc } from "./trpc";

const DEFAULT_USER_ID = "user-123";

const DRAWER_WIDTH = 280;
const DRAWER_COLLAPSED_WIDTH = 0;

export default function App() {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(() =>
    new URLSearchParams(window.location.search).get("threadId"),
  );
  const [showDebug, setShowDebug] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [userId, setUserId] = useState(
    () => localStorage.getItem("userId") || DEFAULT_USER_ID,
  );

  const handleUserIdChange = (id: string) => {
    setUserId(id);
    localStorage.setItem("userId", id);
  };

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

  // Load threads; if no thread active yet, start a fresh chat
  const activeThreadIdRef = useRef(activeThreadId);
  activeThreadIdRef.current = activeThreadId;
  useEffect(() => {
    trpc.thread.list.query().then((loadedThreads) => {
      setThreads(loadedThreads);
      if (!activeThreadIdRef.current) {
        setActiveThreadId(crypto.randomUUID());
      }
    });
  }, []);

  const handleSelectThread = (id: string) => {
    setActiveThreadId(id);
  };

  const handleCreateThread = () => {
    setActiveThreadId(crypto.randomUUID());
  };

  const handleDeleteThread = async (id: string) => {
    await trpc.thread.delete.mutate({ id });
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (activeThreadId === id) {
      setActiveThreadId(null);
    }
  };

  const drawerWidth = sidebarOpen ? DRAWER_WIDTH : DRAWER_COLLAPSED_WIDTH;

  return (
    <>
      <CssBaseline />
      <Box sx={{ display: "flex", height: "100vh" }}>
        <Drawer
          variant="permanent"
          sx={{
            width: drawerWidth,
            flexShrink: 0,
            transition: "width 0.2s",
            "& .MuiDrawer-paper": {
              width: drawerWidth,
              boxSizing: "border-box",
              bgcolor: "#202123",
              borderRight: sidebarOpen ? "1px solid #393b40" : "none",
              overflow: "hidden",
              transition: "width 0.2s",
            },
          }}
        >
          <ConversationList
            threads={threads}
            activeThreadId={activeThreadId}
            onSelect={handleSelectThread}
            onCreate={handleCreateThread}
            onDelete={handleDeleteThread}
            onCollapse={() => setSidebarOpen(false)}
            userId={userId}
            onUserIdChange={handleUserIdChange}
          />
        </Drawer>

        <Box
          component="main"
          sx={{ flex: 1, display: "flex", flexDirection: "column" }}
        >
          {!sidebarOpen && (
            <Box sx={{ position: "absolute", top: 8, left: 8, zIndex: 1 }}>
              <IconButton
                onClick={() => setSidebarOpen(true)}
                sx={{
                  color: "text.secondary",
                  bgcolor: "background.paper",
                  boxShadow: "0 1px 4px rgba(0,0,0,0.1)",
                  "&:hover": { bgcolor: "background.paper" },
                }}
                size="small"
              >
                <MenuIcon />
              </IconButton>
            </Box>
          )}
          {activeThreadId ? (
            <AgentProvider
              api="http://localhost:7301/api/chat"
              threadId={activeThreadId}
              onThreadChange={setActiveThreadId}
              body={{ userId }}
              fetchMessages={(threadId, opts) =>
                trpc.thread.getMessages.query({
                  threadId,
                  before: opts?.before,
                }) as unknown as Promise<UIMessage[]>
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
              <DevTools url="http://localhost:7301/sandbox" agent="assistant" />
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
