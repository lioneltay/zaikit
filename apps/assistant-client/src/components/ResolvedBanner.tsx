import { Paper, Typography } from "@mui/material";

export function ResolvedBanner({ children }: { children: React.ReactNode }) {
  return (
    <Paper
      elevation={1}
      sx={{
        p: 2,
        my: 1,
        border: "1px solid",
        borderColor: "success.light",
        bgcolor: "success.50",
      }}
    >
      <Typography variant="body2" color="text.secondary">
        {children}
      </Typography>
    </Paper>
  );
}
