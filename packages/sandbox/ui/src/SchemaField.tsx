import {
  Box,
  FormControlLabel,
  MenuItem,
  Select,
  Switch,
  TextField,
  Typography,
} from "@mui/material";

type JsonSchema = Record<string, unknown>;

export function SchemaField({
  name,
  schema,
  value,
  onChange,
  depth = 0,
}: {
  name: string;
  schema: JsonSchema;
  value: unknown;
  onChange: (value: unknown) => void;
  depth?: number;
}) {
  const type = schema.type as string | undefined;
  const enumValues = schema.enum as unknown[] | undefined;

  if (Array.isArray(enumValues)) {
    return (
      <Box sx={{ mb: 1.5, ml: depth * 2 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          {name}
        </Typography>
        <Select
          fullWidth
          size="small"
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value)}
          sx={{ mt: 0.5 }}
        >
          {enumValues.map((v) => (
            <MenuItem key={String(v)} value={v as string}>
              {String(v)}
            </MenuItem>
          ))}
        </Select>
      </Box>
    );
  }

  if (type === "boolean") {
    return (
      <Box sx={{ ml: depth * 2 }}>
        <FormControlLabel
          control={
            <Switch
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
              size="small"
            />
          }
          label={
            <Typography variant="body2" fontWeight={600}>
              {name}
            </Typography>
          }
        />
      </Box>
    );
  }

  if (type === "number" || type === "integer") {
    return (
      <Box sx={{ mb: 1.5, ml: depth * 2 }}>
        <Typography variant="caption" color="text.secondary" fontWeight={600}>
          {name}
        </Typography>
        <TextField
          fullWidth
          size="small"
          type="number"
          value={value ?? 0}
          onChange={(e) => onChange(Number(e.target.value))}
          sx={{ mt: 0.5 }}
        />
      </Box>
    );
  }

  if (type === "object") {
    const properties = schema.properties as
      | Record<string, JsonSchema>
      | undefined;
    if (!properties) return null;
    const objValue = (value ?? {}) as Record<string, unknown>;
    return (
      <Box sx={{ mb: 1.5, ml: depth * 2 }}>
        {depth > 0 && (
          <Typography
            variant="caption"
            color="text.secondary"
            fontWeight={600}
            sx={{ mb: 0.5, display: "block" }}
          >
            {name}
          </Typography>
        )}
        {Object.entries(properties).map(([key, propSchema]) => (
          <SchemaField
            key={key}
            name={key}
            schema={propSchema}
            value={objValue[key]}
            onChange={(v) => onChange({ ...objValue, [key]: v })}
            depth={depth > 0 ? depth + 1 : 0}
          />
        ))}
      </Box>
    );
  }

  // Default: string
  return (
    <Box sx={{ mb: 1.5, ml: depth * 2 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600}>
        {name}
      </Typography>
      <TextField
        fullWidth
        size="small"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        sx={{ mt: 0.5 }}
      />
    </Box>
  );
}
