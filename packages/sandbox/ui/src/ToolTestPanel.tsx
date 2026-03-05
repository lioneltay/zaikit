import ClearIcon from "@mui/icons-material/Clear";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import RestoreIcon from "@mui/icons-material/Restore";
import {
  Box,
  Button,
  CircularProgress,
  Collapse,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import { useState } from "react";
import { buildDefaultValues } from "../../src/schema-utils";
import { executeTool, type ToolExecutionResult } from "./api";
import { SchemaField } from "./SchemaField";
import { useTokens } from "./theme";

type ToolTestPanelProps = {
  agentName: string;
  toolName: string;
  parameters: Record<string, unknown> | undefined;
  agentContext: Record<string, unknown>;
  toolContextSchema?: Record<string, unknown>;
};

export function ToolTestPanel({
  agentName,
  toolName,
  parameters,
  agentContext,
  toolContextSchema,
}: ToolTestPanelProps) {
  const tokens = useTokens();

  const hasSchema =
    parameters?.type === "object" &&
    parameters.properties &&
    Object.keys(parameters.properties as object).length > 0;

  const hasToolContextSchema = Boolean(
    toolContextSchema?.type === "object" &&
      toolContextSchema.properties &&
      Object.keys(toolContextSchema.properties as object).length > 0,
  );

  const [mode, setMode] = useState<"form" | "json">(
    hasSchema ? "form" : "json",
  );
  const [formValues, setFormValues] = useState<unknown>(() =>
    hasSchema && parameters ? buildDefaultValues(parameters) : {},
  );
  const [jsonValue, setJsonValue] = useState(() =>
    hasSchema && parameters
      ? JSON.stringify(buildDefaultValues(parameters), null, 2)
      : "{}",
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<ToolExecutionResult | null>(null);

  // Tool-level context override
  const [showContextOverride, setShowContextOverride] = useState(false);
  const [contextOverride, setContextOverride] = useState<
    Record<string, unknown> | undefined
  >(undefined);

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

    const context = contextOverride ?? agentContext;
    setIsRunning(true);

    try {
      const res = await executeTool(agentName, toolName, input, context);
      setResult(res);
    } catch (err) {
      setResult({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsRunning(false);
    }
  };

  const handleClear = () => {
    setResult(null);
  };

  const resultKind = result
    ? !result.ok
      ? "error"
      : result.suspended
        ? "suspended"
        : "success"
    : null;

  const resultBgColor =
    resultKind === "success"
      ? tokens.schema.output
      : resultKind === "suspended"
        ? tokens.schema.suspend
        : resultKind === "error"
          ? "rgba(211, 47, 47, 0.08)"
          : undefined;

  const resultTextColor =
    resultKind === "error" ? "error.main" : "text.primary";

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
              schema={parameters as Record<string, unknown>}
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

      {/* Tool context override */}
      {hasToolContextSchema && (
        <Box sx={{ mt: 1.5 }}>
          <Button
            size="small"
            variant="text"
            onClick={() => {
              if (!showContextOverride) {
                setShowContextOverride(true);
              } else {
                setShowContextOverride(false);
                setContextOverride(undefined);
              }
            }}
            sx={{ textTransform: "none", fontSize: "0.75rem" }}
          >
            {contextOverride
              ? "Context (override)"
              : showContextOverride
                ? "Context (editing)"
                : "Context (using agent default)"}
          </Button>
          {contextOverride && (
            <Button
              size="small"
              variant="text"
              startIcon={<RestoreIcon sx={{ fontSize: 14 }} />}
              onClick={() => {
                setContextOverride(undefined);
                setShowContextOverride(false);
              }}
              sx={{ textTransform: "none", fontSize: "0.75rem", ml: 0.5 }}
            >
              Reset
            </Button>
          )}
          <Collapse in={showContextOverride}>
            <Box
              sx={{
                mt: 0.5,
                p: 1.5,
                border: "1px dashed",
                borderColor: "divider",
                borderRadius: "6px",
              }}
            >
              <SchemaField
                name=""
                schema={toolContextSchema as Record<string, unknown>}
                value={contextOverride ?? agentContext}
                onChange={(v) =>
                  setContextOverride(v as Record<string, unknown>)
                }
              />
            </Box>
          </Collapse>
        </Box>
      )}

      <Box sx={{ mt: 1, display: "flex", gap: 1, alignItems: "center" }}>
        <Button
          variant="contained"
          size="small"
          startIcon={
            isRunning ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <PlayArrowIcon />
            )
          }
          onClick={handleRun}
          disabled={isRunning}
        >
          Run
        </Button>
        {result && (
          <Button size="small" startIcon={<ClearIcon />} onClick={handleClear}>
            Clear
          </Button>
        )}
      </Box>

      {result && resultKind && (
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
          {resultKind === "success" && (
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

          {resultKind === "suspended" && (
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

          {resultKind === "error" && (
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
