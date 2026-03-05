import { Box, Typography } from "@mui/material";
import type { GetUserActivityToolProps } from "../generated/generated";

const ACTION_COLORS: Record<string, string> = {
  viewed: "#1976D2",
  edited: "#ED6C02",
  created: "#2E7D32",
  deleted: "#D32F2F",
};

export function UserActivityTool(props: GetUserActivityToolProps) {
  if (props.state !== "result") return null;

  const result = props.result as {
    userId: string;
    activities: {
      id: string;
      action: string;
      target: string;
      timestamp: string;
    }[];
  } | null;

  if (!result) return null;

  return (
    <Box
      sx={{
        p: 2,
        my: 1,
        border: "1px solid #00897B",
        borderRadius: "12px",
        bgcolor: "#E0F2F1",
      }}
    >
      <Typography variant="body2" fontWeight={600} sx={{ mb: 1 }}>
        Recent Activity — {result.userId}
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 0.5 }}>
        {result.activities.map((a) => (
          <Box
            key={a.id}
            sx={{ display: "flex", alignItems: "center", gap: 1 }}
          >
            <Box
              sx={{
                width: 6,
                height: 6,
                borderRadius: "50%",
                bgcolor: ACTION_COLORS[a.action] ?? "#666",
                flexShrink: 0,
              }}
            />
            <Typography variant="caption" sx={{ flex: 1 }}>
              <strong>{a.action}</strong> {a.target}
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {new Date(a.timestamp).toLocaleTimeString()}
            </Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
