import DarkModeIcon from "@mui/icons-material/DarkMode";
import LightModeIcon from "@mui/icons-material/LightMode";
import NotificationsIcon from "@mui/icons-material/Notifications";
import NotificationsOffIcon from "@mui/icons-material/NotificationsOff";
import { Box, Chip, Typography } from "@mui/material";
import type { GetUserSettingsToolProps } from "../generated/generated";

export function UserSettingsTool(props: GetUserSettingsToolProps) {
  if (props.state !== "result") return null;

  const result = props.result as {
    userId: string;
    orgName: string;
    theme: string;
    language: string;
    notifications: boolean;
  } | null;

  if (!result) return null;

  return (
    <Box
      sx={{
        p: 2,
        my: 1,
        border: "1px solid #9C27B0",
        borderRadius: "12px",
        bgcolor: "#F3E5F5",
      }}
    >
      <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
        User Settings — {result.orgName}
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Chip
          size="small"
          icon={result.theme === "dark" ? <DarkModeIcon /> : <LightModeIcon />}
          label={result.theme}
        />
        <Chip size="small" label={result.language.toUpperCase()} />
        <Chip
          size="small"
          icon={
            result.notifications ? (
              <NotificationsIcon />
            ) : (
              <NotificationsOffIcon />
            )
          }
          label={
            result.notifications ? "Notifications on" : "Notifications off"
          }
          color={result.notifications ? "success" : "default"}
        />
      </Box>
    </Box>
  );
}
