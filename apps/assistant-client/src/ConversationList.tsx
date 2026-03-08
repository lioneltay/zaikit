import AddIcon from "@mui/icons-material/Add";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import DeleteIcon from "@mui/icons-material/Delete";
import PersonIcon from "@mui/icons-material/Person";
import {
  Box,
  Button,
  IconButton,
  InputBase,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
  Typography,
} from "@mui/material";
import type { Thread } from "./trpc";

type ConversationListProps = {
  threads: Thread[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
  onCollapse: () => void;
  userId: string;
  onUserIdChange: (id: string) => void;
};

export default function ConversationList({
  threads,
  activeThreadId,
  onSelect,
  onCreate,
  onDelete,
  onCollapse,
  userId,
  onUserIdChange,
}: ConversationListProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          gap: 1,
          px: 1.5,
          pt: 2,
          pb: 1,
        }}
      >
        <Button
          variant="outlined"
          startIcon={<AddIcon />}
          onClick={onCreate}
          fullWidth
          sx={{
            color: "#fff",
            borderColor: "rgba(255,255,255,0.2)",
            borderRadius: "8px",
            "&:hover": {
              borderColor: "rgba(255,255,255,0.4)",
              bgcolor: "rgba(255,255,255,0.08)",
            },
          }}
        >
          New Chat
        </Button>
        <IconButton
          onClick={onCollapse}
          size="small"
          sx={{ color: "rgba(255,255,255,0.5)", flexShrink: 0 }}
        >
          <ChevronLeftIcon />
        </IconButton>
      </Box>

      <List
        sx={{
          flex: 1,
          overflowY: "auto",
          px: 1.5,
          scrollbarColor: "rgba(255,255,255,0.2) transparent",
          "&::-webkit-scrollbar-thumb": {
            background: "rgba(255,255,255,0.2)",
          },
          "&::-webkit-scrollbar-thumb:hover": {
            background: "rgba(255,255,255,0.35)",
          },
        }}
      >
        {threads.map((thread) => (
          <ListItemButton
            key={thread.id}
            selected={thread.id === activeThreadId}
            onClick={() => onSelect(thread.id)}
            sx={{
              borderRadius: "8px",
              mb: 0.25,
              py: 0.75,
              color: "#fff",
              "&:hover": {
                bgcolor: "rgba(255,255,255,0.08)",
              },
              "&.Mui-selected": {
                bgcolor: "rgba(255,255,255,0.12)",
                borderLeft: "3px solid",
                borderLeftColor: "primary.main",
                "&:hover": {
                  bgcolor: "rgba(255,255,255,0.15)",
                },
              },
              "& .delete-btn": {
                opacity: 0,
                transition: "opacity 0.2s",
              },
              "&:hover .delete-btn": {
                opacity: 1,
              },
            }}
          >
            <ListItemIcon sx={{ minWidth: 32, color: "rgba(255,255,255,0.5)" }}>
              <ChatBubbleOutlineIcon sx={{ fontSize: 18 }} />
            </ListItemIcon>
            <ListItemText
              primary={
                <Typography
                  noWrap
                  sx={{
                    fontSize: 14,
                    color: "rgba(255,255,255,0.85)",
                  }}
                >
                  {thread.title || "Untitled"}
                </Typography>
              }
            />
            <ListItemSecondaryAction>
              <IconButton
                className="delete-btn"
                edge="end"
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(thread.id);
                }}
                sx={{ color: "rgba(255,255,255,0.4)" }}
              >
                <DeleteIcon fontSize="small" />
              </IconButton>
            </ListItemSecondaryAction>
          </ListItemButton>
        ))}
      </List>

      <Box
        sx={{
          px: 1.5,
          py: 1.5,
          borderTop: "1px solid rgba(255,255,255,0.1)",
        }}
      >
        <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <PersonIcon sx={{ fontSize: 16, color: "rgba(255,255,255,0.4)" }} />
          <Typography
            sx={{ fontSize: 11, color: "rgba(255,255,255,0.4)", flexShrink: 0 }}
          >
            User ID
          </Typography>
        </Box>
        <InputBase
          value={userId}
          onChange={(e) => onUserIdChange(e.target.value)}
          fullWidth
          sx={{
            mt: 0.5,
            px: 1,
            py: 0.25,
            fontSize: 13,
            color: "rgba(255,255,255,0.85)",
            bgcolor: "rgba(255,255,255,0.06)",
            borderRadius: "6px",
            border: "1px solid rgba(255,255,255,0.1)",
            "&:hover": { borderColor: "rgba(255,255,255,0.2)" },
            "& .MuiInputBase-input": {
              padding: 0,
            },
          }}
        />
      </Box>
    </Box>
  );
}
