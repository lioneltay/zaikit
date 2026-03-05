import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import { Box, Button, Paper, Typography } from "@mui/material";
import { useTool } from "@zaikit/react";
import { z } from "zod";
import { useToolRenderer } from "../generated/generated";
import { ApprovalTool } from "./ApprovalTool";
import { BookFlightTool } from "./BookFlightTool";
import { SendEmailTool } from "./SendEmailTool";
import { UserActivityTool } from "./UserActivityTool";
import { UserSettingsTool } from "./UserSettingsTool";

function FrontendTools() {
  // Handler-only: runs automatically, no UI
  useTool({
    name: "get_current_url",
    description: "Get the current page URL and title from the user's browser",
    inputSchema: z.object({}),
    execute: async () => ({
      url: window.location.href,
      title: document.title,
    }),
  });

  // Render-only: shows UI, user interacts
  useTool({
    name: "confirm_action",
    description:
      "Ask the user to confirm or deny an action before proceeding. Use this when you need explicit user approval.",
    inputSchema: z.object({
      message: z.string().describe("The confirmation message to show"),
    }),
    render: ({ args, state, resume }) => (
      <Paper
        variant="outlined"
        sx={{ p: 2, my: 1, display: "flex", flexDirection: "column", gap: 1.5 }}
      >
        <Typography variant="body2" fontWeight={500}>
          {args.message}
        </Typography>
        {state === "call" ? (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              size="small"
              variant="contained"
              color="success"
              onClick={() => resume({ confirmed: true })}
            >
              Confirm
            </Button>
            <Button
              size="small"
              variant="outlined"
              color="error"
              onClick={() => resume({ confirmed: false })}
            >
              Deny
            </Button>
          </Box>
        ) : (
          <Box sx={{ display: "flex", alignItems: "center", gap: 0.5 }}>
            <CheckCircleIcon color="success" fontSize="small" />
            <Typography variant="caption" color="text.secondary">
              Resolved
            </Typography>
          </Box>
        )}
      </Paper>
    ),
  });

  return null;
}

export function ToolRenderers() {
  useToolRenderer("delete_records", (props) => <ApprovalTool {...props} />);
  useToolRenderer("book_flight", (props) => <BookFlightTool {...props} />);
  useToolRenderer("send_email", (props) => <SendEmailTool {...props} />);
  useToolRenderer("get_user_settings", (props) => (
    <UserSettingsTool {...props} />
  ));
  useToolRenderer("get_user_activity", (props) => (
    <UserActivityTool {...props} />
  ));
  return <FrontendTools />;
}
