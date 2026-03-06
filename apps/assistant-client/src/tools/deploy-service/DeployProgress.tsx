import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import HourglassBottomIcon from "@mui/icons-material/HourglassBottom";
import { Box, Typography } from "@mui/material";

type DeployStep = {
  step: string;
  detail: string;
  status: "running" | "done";
};

export function DeployProgress({ data }: { data: DeployStep }) {
  const isDone = data.status === "done";

  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        gap: 1,
        py: 0.25,
      }}
    >
      {isDone ? (
        <CheckCircleIcon sx={{ fontSize: 16, color: "#10B981" }} />
      ) : (
        <HourglassBottomIcon
          sx={{
            fontSize: 16,
            color: "#7C3AED",
            animation: "spin 1s linear infinite",
            "@keyframes spin": {
              from: { transform: "rotate(0deg)" },
              to: { transform: "rotate(360deg)" },
            },
          }}
        />
      )}
      <Typography variant="body2" sx={{ fontWeight: 500, fontSize: "0.85rem" }}>
        {data.step}
      </Typography>
      <Typography variant="caption" color="text.secondary">
        {data.detail}
      </Typography>
    </Box>
  );
}
