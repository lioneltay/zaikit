import SendIcon from "@mui/icons-material/Send";
import { Box, Button, Tab, Tabs, TextField, Typography } from "@mui/material";
import { useState } from "react";
import { SchemaField } from "./SchemaField";
import { buildDefaultValues } from "./schema-utils";

type JsonSchema = Record<string, unknown>;

export function ResumeForm({
  onResume,
  resumeSchema,
}: {
  onResume: (data: unknown) => void;
  resumeSchema?: JsonSchema;
}) {
  const hasSchema = !!(
    resumeSchema?.type === "object" &&
    resumeSchema.properties &&
    Object.keys(resumeSchema.properties as object).length > 0
  );

  const [mode, setMode] = useState<"form" | "json">(
    hasSchema ? "form" : "json",
  );
  const [formValues, setFormValues] = useState<unknown>(() =>
    hasSchema ? buildDefaultValues(resumeSchema!) : undefined,
  );
  const [jsonValue, setJsonValue] = useState(() =>
    hasSchema
      ? JSON.stringify(buildDefaultValues(resumeSchema!), null, 2)
      : "{}",
  );
  const [error, setError] = useState<string | null>(null);

  const handleModeChange = (_: unknown, newMode: "form" | "json") => {
    if (newMode === "json") {
      // Sync form values into JSON editor
      setJsonValue(JSON.stringify(formValues ?? {}, null, 2));
      setError(null);
    } else {
      // Sync JSON editor back into form values
      try {
        setFormValues(JSON.parse(jsonValue));
      } catch {
        // Keep existing form values if JSON is invalid
      }
    }
    setMode(newMode);
  };

  const handleSubmit = () => {
    if (mode === "form") {
      onResume(formValues);
    } else {
      try {
        const parsed = JSON.parse(jsonValue);
        setError(null);
        onResume(parsed);
      } catch {
        setError("Invalid JSON");
      }
    }
  };

  return (
    <Box sx={{ mt: 1 }}>
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
          schema={resumeSchema!}
          value={formValues}
          onChange={setFormValues}
        />
      ) : (
        <>
          <Typography variant="caption" color="text.secondary" fontWeight={600}>
            Resume Data (JSON)
          </Typography>
          <TextField
            fullWidth
            multiline
            minRows={2}
            maxRows={6}
            value={jsonValue}
            onChange={(e) => {
              setJsonValue(e.target.value);
              setError(null);
            }}
            error={!!error}
            helperText={error}
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

      <Box sx={{ mt: 1 }}>
        <Button
          variant="contained"
          size="small"
          startIcon={<SendIcon />}
          onClick={handleSubmit}
        >
          Resume
        </Button>
      </Box>
    </Box>
  );
}
