import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import TrafficIcon from "@mui/icons-material/Traffic";
import { Box, Button, Chip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { ResolvedBanner } from "../../components/ResolvedBanner";
import type { DeployServiceToolProps } from "../../generated/generated";
import { DeployProgress } from "./DeployProgress";

function ConfirmationCard({
  color,
  hoverColor,
  bgcolor,
  icon,
  title,
  children,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  color: string;
  hoverColor: string;
  bgcolor: string;
  icon: ReactNode;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Box
      sx={{
        p: 2,
        my: 1,
        border: `1px solid ${color}`,
        borderRadius: "12px",
        bgcolor,
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1 }}>
        {icon}
        <Typography variant="body2" fontWeight={600}>
          {title}
        </Typography>
      </Box>

      {children}

      <Box sx={{ display: "flex", gap: 1 }}>
        <Button
          variant="contained"
          size="small"
          sx={{ bgcolor: color, "&:hover": { bgcolor: hoverColor } }}
          onClick={onConfirm}
        >
          {confirmLabel}
        </Button>
        <Button
          variant="outlined"
          color="error"
          size="small"
          onClick={onCancel}
        >
          {cancelLabel}
        </Button>
      </Box>
    </Box>
  );
}

export function DeployServiceTool(props: DeployServiceToolProps) {
  const payload = props.suspendPayload;
  const phase = payload?.phase;

  const steps = (props.toolData["deploy-progress"] ?? []).flatMap(
    (entry) => entry.data,
  );

  return (
    <Box>
      {steps.map((step, i) => (
        <DeployProgress key={i} data={step} />
      ))}

      {props.state === "suspended" && phase === "confirm-deploy" && (
        <ConfirmationCard
          color="#7C3AED"
          hoverColor="#6D28D9"
          bgcolor="#F5F3FF"
          icon={<RocketLaunchIcon sx={{ color: "#7C3AED", fontSize: 20 }} />}
          title="Deploy Confirmation"
          confirmLabel="Deploy"
          cancelLabel="Cancel"
          onConfirm={() => props.resume({ approved: true })}
          onCancel={() => props.resume({ approved: false })}
        >
          <Box
            sx={{ mb: 1.5, display: "flex", flexDirection: "column", gap: 0.5 }}
          >
            <Typography variant="body2">
              <strong>{payload?.service}</strong> {payload?.version}
            </Typography>
            <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
              <Chip
                label={payload?.environment}
                size="small"
                color={
                  payload?.environment === "production" ? "error" : "warning"
                }
                variant="outlined"
              />
              <Typography variant="caption" color="text.secondary">
                {payload?.checksCompleted} pre-deploy checks passed
              </Typography>
            </Box>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Ready to deploy. Continue?
          </Typography>
        </ConfirmationCard>
      )}

      {props.state === "suspended" && phase === "activate-traffic" && (
        <ConfirmationCard
          color="#059669"
          hoverColor="#047857"
          bgcolor="#ECFDF5"
          icon={<TrafficIcon sx={{ color: "#059669", fontSize: 20 }} />}
          title="Activate Traffic"
          confirmLabel="Activate Traffic"
          cancelLabel="Keep Previous Version"
          onConfirm={() => props.resume({ approved: true })}
          onCancel={() => props.resume({ approved: false })}
        >
          <Box
            sx={{ mb: 1.5, display: "flex", flexDirection: "column", gap: 0.5 }}
          >
            <Typography variant="body2">
              <strong>{payload?.service}</strong> {payload?.version} deployed
              successfully.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {payload?.deployUrl}
            </Typography>
          </Box>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Route live traffic to the new version?
          </Typography>
        </ConfirmationCard>
      )}

      {props.state === "result" && (
        <ResolvedBanner>Deploy — Resolved</ResolvedBanner>
      )}
    </Box>
  );
}
