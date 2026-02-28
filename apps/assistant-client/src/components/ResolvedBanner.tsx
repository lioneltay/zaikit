import { Box, Typography } from "@mui/material";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";

export function ResolvedBanner({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        p: 2,
        my: 1,
        border: "1px solid #4CAF50",
        borderRadius: "12px",
        bgcolor: "#E8F5E9",
        display: "flex",
        alignItems: "center",
        gap: 1,
      }}
    >
      <CheckCircleOutlineIcon
        sx={{ fontSize: 20, color: "#4CAF50" }}
      />
      <Typography variant="body2" color="text.secondary">
        {children}
      </Typography>
    </Box>
  );
}
