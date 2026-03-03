import AddIcon from "@mui/icons-material/Add";
import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import {
  Box,
  Button,
  Chip,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Typography,
} from "@mui/material";
import {
  Link,
  Outlet,
  useLoaderData,
  useNavigate,
  useParams,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  type AgentSummary,
  deleteThread as apiDeleteThread,
  fetchThreads,
  type Thread,
} from "../api";
import { ThreadList } from "../ThreadList";
import { useColorMode, useTokens } from "../theme";

const DRAWER_WIDTH = 260;

export function RootLayout() {
  const { mode, toggleMode } = useColorMode();
  const tokens = useTokens();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as {
    agentName?: string;
    threadId?: string;
  };
  const activeAgent = params.agentName;
  const activeThreadId = params.threadId;

  // Get agents from the root route's loader
  const agents = useLoaderData({ strict: false }) as AgentSummary[] | undefined;

  // Thread state — fetched when agent changes
  const [threads, setThreads] = useState<Thread[]>([]);

  useEffect(() => {
    if (!activeAgent) return;
    let stale = false;
    fetchThreads(activeAgent).then((t) => {
      if (!stale) setThreads(t);
    });
    return () => {
      stale = true;
    };
  }, [activeAgent]);

  const handleSelectThread = (id: string) => {
    if (!activeAgent) return;
    navigate({
      to: "/$agentName/$threadId",
      params: { agentName: activeAgent, threadId: id },
    });
  };

  const handleCreateThread = () => {
    if (!activeAgent) return;
    navigate({
      to: "/$agentName/$threadId",
      params: { agentName: activeAgent, threadId: crypto.randomUUID() },
    });
  };

  const handleDeleteThread = async (id: string) => {
    if (!activeAgent) return;
    await apiDeleteThread(activeAgent, id);
    setThreads((prev) => prev.filter((t) => t.id !== id));
    if (activeThreadId === id) {
      navigate({ to: "/$agentName", params: { agentName: activeAgent } });
    }
  };

  return (
    <Box sx={{ display: "flex", height: "100vh" }}>
      {/* Sidebar */}
      <Drawer
        variant="permanent"
        sx={{
          width: DRAWER_WIDTH,
          flexShrink: 0,
          "& .MuiDrawer-paper": {
            width: DRAWER_WIDTH,
            boxSizing: "border-box",
            bgcolor: tokens.sidebar.bg,
            borderRight: "1px solid",
            borderColor: tokens.sidebar.border,
          },
        }}
      >
        <Box
          sx={{
            p: 2,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{ color: tokens.sidebar.textSecondary, letterSpacing: 1 }}
          >
            ZAIKIT SANDBOX
          </Typography>
          <IconButton
            onClick={toggleMode}
            size="small"
            sx={{ color: tokens.sidebar.textSecondary }}
          >
            {mode === "dark" ? (
              <LightModeIcon sx={{ fontSize: 18 }} />
            ) : (
              <DarkModeIcon sx={{ fontSize: 18 }} />
            )}
          </IconButton>
        </Box>

        <Box sx={{ px: 1.5, mb: 1 }}>
          <Typography
            variant="caption"
            sx={{
              color: tokens.sidebar.textMuted,
              textTransform: "uppercase",
              letterSpacing: 0.5,
              px: 1,
            }}
          >
            Agents
          </Typography>
        </Box>

        <List sx={{ px: 1 }}>
          {agents?.map((agent) => (
            <ListItemButton
              key={agent.name}
              component={Link as any}
              to="/$agentName"
              params={{ agentName: agent.name }}
              selected={agent.name === activeAgent}
              sx={{
                borderRadius: "8px",
                mb: 0.25,
                color: tokens.sidebar.textPrimary,
                textDecoration: "none",
                "&:hover": { bgcolor: tokens.sidebar.hoverBg },
                "&.Mui-selected": {
                  bgcolor: tokens.sidebar.selectedBg,
                  borderLeft: "3px solid",
                  borderColor: "primary.main",
                  "&:hover": { bgcolor: tokens.sidebar.selectedHoverBg },
                },
              }}
            >
              <ListItemIcon
                sx={{ minWidth: 36, color: tokens.sidebar.iconColor }}
              >
                <SmartToyIcon sx={{ fontSize: 20 }} />
              </ListItemIcon>
              <ListItemText
                primary={agent.name}
                secondary={
                  <Box
                    component="span"
                    sx={{ display: "flex", gap: 0.5, mt: 0.25 }}
                  >
                    <Chip
                      label={agent.model}
                      size="small"
                      sx={{
                        fontSize: "0.6rem",
                        height: 18,
                        bgcolor: tokens.sidebar.chipBg,
                        color: tokens.sidebar.textSecondary,
                      }}
                    />
                    <Chip
                      label={`${agent.toolCount} tools`}
                      size="small"
                      sx={{
                        fontSize: "0.6rem",
                        height: 18,
                        bgcolor: tokens.sidebar.chipBg,
                        color: tokens.sidebar.textSecondary,
                      }}
                    />
                  </Box>
                }
                primaryTypographyProps={{ fontSize: 14 }}
              />
            </ListItemButton>
          ))}
        </List>

        {activeAgent && (
          <>
            <Box sx={{ px: 1.5, mt: 2, mb: 1 }}>
              <Box
                sx={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  px: 1,
                }}
              >
                <Typography
                  variant="caption"
                  sx={{
                    color: tokens.sidebar.textMuted,
                    textTransform: "uppercase",
                    letterSpacing: 0.5,
                  }}
                >
                  Threads
                </Typography>
                <Button
                  size="small"
                  startIcon={<AddIcon sx={{ fontSize: 14 }} />}
                  onClick={handleCreateThread}
                  sx={{
                    fontSize: "0.65rem",
                    color: tokens.sidebar.textSecondary,
                    minWidth: 0,
                    px: 1,
                    textTransform: "none",
                  }}
                >
                  New
                </Button>
              </Box>
            </Box>
            <ThreadList
              threads={threads}
              activeThreadId={activeThreadId ?? null}
              onSelect={handleSelectThread}
              onDelete={handleDeleteThread}
            />
          </>
        )}
      </Drawer>

      {/* Main content — rendered by child routes */}
      <Outlet />
    </Box>
  );
}
