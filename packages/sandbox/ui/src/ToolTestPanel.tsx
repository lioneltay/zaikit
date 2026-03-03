import ClearIcon from "@mui/icons-material/Clear";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
  Box,
  Button,
  CircularProgress,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { executeTool, type ToolExecutionResult } from "./api";
import { SchemaField } from "./SchemaField";
import { buildDefaultValues } from "./schema-utils";
import { useTokens } from "./theme";

type ToolTestPanelProps = {
  agentName: string;
  toolName: string;
  parameters: Record<string, unknown> | undefined;
};

type Status = "idle" | "running" | "success" | "error" | "suspended";

export function ToolTestPanel({
  agentName,
  toolName,
  parameters,
}: ToolTestPanelProps) {
  const tokens = useTokens();

  const hasSchema =
    parameters?.type === "object" &&
    parameters.properties &&
    Object.keys(parameters.properties as object).length > 0;

  const [mode, setMode] = useState<"form" | "json">(
    hasSchema ? "form" : "json",
  );
  const [formValues, setFormValues] = useState<unknown>(() =>
    hasSchema ? buildDefaultValues(parameters!) : {},
  );
  const [jsonValue, setJsonValue] = useState(() =>
    hasSchema ? JSON.stringify(buildDefaultValues(parameters!), null, 2) : "{}",
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [result, setResult] = useState<ToolExecutionResult | null>(null);

  const handleModeChange = (_: unknown, newMode: "form" | "json") => {
    if (newMode === "json") {
      setJsonValue(JSON.stringify(formValues ?? {}, null, 2));
      setJsonError(null);
    } else {
      try {
        setFormValues(JSON.parse(jsonValue));
      } catch {
        // Keep existing form values if JSON is invalid
      }
    }
    setMode(newMode);
  };

  const handleRun = async () => {
    let input: unknown;
    if (mode === "form") {
      input = formValues;
    } else {
      try {
        input = JSON.parse(jsonValue);
        setJsonError(null);
      } catch {
        setJsonError("Invalid JSON");
        return;
      }
    }

    setStatus("running");
    setResult(null);

    try {
      const res = await executeTool(agentName, toolName, input);
      setResult(res);
      if (!res.ok) {
        setStatus("error");
      } else if (res.suspended) {
        setStatus("suspended");
      } else {
        setStatus("success");
      }
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
      setStatus("error");
    }
  };

  const handleClear = () => {
    setStatus("idle");
    setResult(null);
  };

  const resultBgColor =
    status === "success"
      ? tokens.schema.output
      : status === "suspended"
        ? tokens.schema.suspend
        : status === "error"
          ? "rgba(211, 47, 47, 0.08)"
          : undefined;

  const resultTextColor = status === "error" ? "error.main" : "text.primary";

  return (
    <Box sx={{ mt: 1.5 }}>
      {!hasSchema && parameters === undefined && (
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          This tool takes no input.
        </Typography>
      )}

      {(hasSchema || parameters !== undefined) && (
        <>
          {hasSchema && (
            <Tabs
              value={mode}
              onChange={handleModeChange}
              sx={{ minHeight: 32, mb: 1 }}
            >
              <Tab label="Form" value="form" sx={{ minHeight: 32, py: 0 }} />
              <Tab label="JSON" value="json" sx={{ minHeight: 32, py: 0 }} />
            </Tabs>
          )}

          {mode === "form" && hasSchema ? (
            <SchemaField
              name=""
              schema={parameters!}
              value={formValues}
              onChange={setFormValues}
            />
          ) : (
            <>
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={600}
              >
                Input (JSON)
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={2}
                maxRows={6}
                value={jsonValue}
                onChange={(e) => {
                  setJsonValue(e.target.value);
                  setJsonError(null);
                }}
                error={!!jsonError}
                helperText={jsonError}
                sx={{
                  mt: 0.5,
                  "& .MuiInputBase-root": {
                    fontFamily: "monospace",
                    fontSize: "0.8rem",
                  },
                }}
              />
            </>
          )}
        </>
      )}

      <Box sx={{ mt: 1, display: "flex", gap: 1, alignItems: "center" }}>
        <Button
          variant="contained"
          size="small"
          startIcon={
            status === "running" ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <PlayArrowIcon />
            )
          }
          onClick={handleRun}
          disabled={status === "running"}
        >
          Run
        </Button>
        {result && (
          <Button size="small" startIcon={<ClearIcon />} onClick={handleClear}>
            Clear
          </Button>
        )}
      </Box>

      {result && status !== "idle" && (
        <Box
          sx={{
            mt: 1.5,
            p: 1.5,
            bgcolor: resultBgColor,
            borderRadius: "6px",
            overflow: "auto",
            maxHeight: 300,
          }}
        >
          {status === "success" && (
            <>
              <Typography
                variant="caption"
                color="text.secondary"
                fontWeight={600}
                sx={{ display: "block", mb: 0.5 }}
              >
                Output
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  fontSize: "0.75rem",
                  fontFamily:
                    '"SF Mono", "Fira Code", Menlo, Consolas, monospace',
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: resultTextColor,
                }}
              >
                {typeof result.output === "string"
                  ? result.output
                  : JSON.stringify(result.output, null, 2)}
              </Box>
            </>
          )}

          {status === "suspended" && (
            <>
              <Typography
                variant="caption"
                fontWeight={600}
                sx={{ display: "block", mb: 0.5, color: "warning.main" }}
              >
                Tool Suspended
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  fontSize: "0.75rem",
                  fontFamily:
                    '"SF Mono", "Fira Code", Menlo, Consolas, monospace',
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                }}
              >
                {JSON.stringify(result.suspendPayload, null, 2)}
              </Box>
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ display: "block", mt: 1 }}
              >
                This tool suspended. Resume is only available through the chat
                flow.
              </Typography>
            </>
          )}

          {status === "error" && (
            <>
              <Typography
                variant="caption"
                fontWeight={600}
                sx={{ display: "block", mb: 0.5, color: "error.main" }}
              >
                Error
              </Typography>
              <Box
                component="pre"
                sx={{
                  m: 0,
                  fontSize: "0.75rem",
                  fontFamily:
                    '"SF Mono", "Fira Code", Menlo, Consolas, monospace',
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  color: "error.main",
                }}
              >
                {result.error}
              </Box>
            </>
          )}
        </Box>
      )}
    </Box>
  );
}
