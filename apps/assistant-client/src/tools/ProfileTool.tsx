import BadgeIcon from "@mui/icons-material/Badge";
import BusinessIcon from "@mui/icons-material/Business";
import EmailIcon from "@mui/icons-material/Email";
import { Box, Chip, Typography } from "@mui/material";
import type { GetMyProfileToolProps } from "../generated/generated";

export function ProfileTool(props: GetMyProfileToolProps) {
  if (props.state !== "result") return null;

  const result = props.result as {
    userId: string;
    orgName: string;
    name: string;
    email?: string;
    department: string;
    role: string;
    joinDate?: string;
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
        {result.name}
      </Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <Chip size="small" icon={<BadgeIcon />} label={result.role} />
        <Chip
          size="small"
          icon={<BusinessIcon />}
          label={`${result.department} — ${result.orgName}`}
        />
        {result.email && (
          <Chip size="small" icon={<EmailIcon />} label={result.email} />
        )}
      </Box>
    </Box>
  );
}
