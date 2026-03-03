import AddIcon from "@mui/icons-material/Add";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import { Box, Button, Typography } from "@mui/material";
import {
  Outlet,
  useMatch,
  useNavigate,
  useParams,
} from "@tanstack/react-router";

export function AgentLayout() {
  const { agentName } = useParams({ strict: false }) as { agentName: string };
  const navigate = useNavigate();

  const threadMatch = useMatch({
    from: "/$agentName/$threadId",
    shouldThrow: false,
  });
  const hasThread = !!threadMatch;

  const handleCreateThread = () => {
    navigate({
      to: "/$agentName/$threadId",
      params: { agentName, threadId: crypto.randomUUID() },
    });
  };

  if (hasThread) {
    return <Outlet />;
  }

  return (
    <Box
      component="main"
      sx={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 2,
      }}
    >
      <SmartToyIcon sx={{ fontSize: 64, color: "text.disabled" }} />
      <Typography color="text.secondary">
        Start a new conversation with <strong>{agentName}</strong>
      </Typography>
      <Button
        variant="contained"
        startIcon={<AddIcon />}
        onClick={handleCreateThread}
      >
        New Chat
      </Button>
    </Box>
  );
}
