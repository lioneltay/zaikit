import {
  List,
  ListItemButton,
  ListItemText,
  ListItemIcon,
  IconButton,
  ListItemSecondaryAction,
  Typography,
  Button,
  Box,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import type { Thread } from "./trpc";

type ConversationListProps = {
  threads: Thread[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onCreate: () => void;
  onDelete: (id: string) => void;
};

export default function ConversationList({
  threads,
  activeThreadId,
  onSelect,
  onCreate,
  onDelete,
}: ConversationListProps) {
  return (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ p: 2 }}>
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
      </Box>

      <List
        sx={{
          flex: 1,
          overflowY: "auto",
          px: 1,
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
              mb: 0.5,
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
    </Box>
  );
}
