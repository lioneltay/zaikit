import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import { Box, Button, Chip, Typography } from "@mui/material";
import { ResolvedBanner } from "../../components/ResolvedBanner";
import type { DeployServiceToolProps } from "../../generated/generated";
import { DeployProgress } from "./DeployProgress";

export function DeployServiceTool(props: DeployServiceToolProps) {
  const { service, environment, version, checksCompleted } =
    props.suspendPayload ?? {};

  const steps = props.data
    .filter((d) => d.type === "deploy-progress")
    .flatMap((d) => (d.data as any[]) ?? []);

  return (
    <Box>
      {steps.map((step, i) => (
        <DeployProgress key={i} data={step} />
      ))}

      {props.state === "suspended" && (
        <Box
          sx={{
            p: 2,
            my: 1,
            border: "1px solid #7C3AED",
            borderRadius: "12px",
            bgcolor: "#F5F3FF",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
            <RocketLaunchIcon sx={{ color: "#7C3AED", fontSize: 20 }} />
            <Typography variant="body2" fontWeight={600}>
              Deploy Confirmation
            </Typography>
          </Box>

          <Box
            sx={{ mb: 1.5, display: "flex", flexDirection: "column", gap: 0.5 }}
          >
            <Typography variant="body2">
              <strong>{service}</strong> {version}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Chip
                label={environment}
                size="small"
                color={environment === "production" ? "error" : "warning"}
                variant="outlined"
              />
              <Typography variant="caption" color="text.secondary">
                {checksCompleted} pre-deploy checks passed
              </Typography>
            </Box>
          </Box>

          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Ready to deploy. Continue?
          </Typography>

          <Box sx={{ display: "flex", gap: 1 }}>
            <Button
              variant="contained"
              size="small"
              sx={{ bgcolor: "#7C3AED", "&:hover": { bgcolor: "#6D28D9" } }}
              onClick={() => props.resume({ approved: true })}
            >
              Deploy
            </Button>
            <Button
              variant="outlined"
              color="error"
              size="small"
              onClick={() => props.resume({ approved: false })}
            >
              Cancel
            </Button>
          </Box>
        </Box>
      )}

      {props.state === "result" && (
        <ResolvedBanner>Deploy — Resolved</ResolvedBanner>
      )}
    </Box>
  );
}
