import ChatBubbleOutlineIcon from "@mui/icons-material/ChatBubbleOutline";
import DeleteIcon from "@mui/icons-material/Delete";
import {
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemSecondaryAction,
  ListItemText,
  Typography,
} from "@mui/material";
import type { Thread } from "./api";
import { useTokens } from "./theme";

export function ThreadList({
  threads,
  activeThreadId,
  onSelect,
  onDelete,
}: {
  threads: Thread[];
  activeThreadId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const tokens = useTokens();

  return (
    <List
      sx={{
        flex: 1,
        overflowY: "auto",
        px: 1,
        scrollbarColor: tokens.sidebar.scrollbar,
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
            py: 0.5,
            color: tokens.sidebar.textPrimary,
            "&:hover": { bgcolor: tokens.sidebar.hoverBg },
            "&.Mui-selected": {
              bgcolor: tokens.sidebar.selectedBg,
              "&:hover": { bgcolor: tokens.sidebar.selectedHoverBg },
            },
            "& .delete-btn": { opacity: 0, transition: "opacity 0.2s" },
            "&:hover .delete-btn": { opacity: 1 },
          }}
        >
          <ListItemIcon sx={{ minWidth: 28, color: tokens.sidebar.iconColor }}>
            <ChatBubbleOutlineIcon sx={{ fontSize: 16 }} />
          </ListItemIcon>
          <ListItemText
            primary={
              <Typography
                noWrap
                sx={{ fontSize: 13, color: tokens.sidebar.textPrimary }}
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
              sx={{ color: tokens.sidebar.iconMuted }}
            >
              <DeleteIcon sx={{ fontSize: 16 }} />
            </IconButton>
          </ListItemSecondaryAction>
        </ListItemButton>
      ))}
    </List>
  );
}
