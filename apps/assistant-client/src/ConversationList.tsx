import {
  List,
  ListItemButton,
  ListItemText,
  IconButton,
  ListItemSecondaryAction,
  Typography,
  Button,
  Box,
} from "@mui/material";
import DeleteIcon from "@mui/icons-material/Delete";
import AddIcon from "@mui/icons-material/Add";
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
          variant="contained"
          startIcon={<AddIcon />}
          onClick={onCreate}
          fullWidth
        >
          New Chat
        </Button>
      </Box>

      <List sx={{ flex: 1, overflowY: "auto" }}>
        {threads.map((thread) => (
          <ListItemButton
            key={thread.id}
            selected={thread.id === activeThreadId}
            onClick={() => onSelect(thread.id)}
          >
            <ListItemText
              primary={
                <Typography noWrap>
                  {thread.title || "Untitled"}
                </Typography>
              }
            />
            <ListItemSecondaryAction>
              <IconButton
                edge="end"
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(thread.id);
                }}
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
