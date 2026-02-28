import { useState, useMemo, memo } from "react";
import type { UIMessage } from "ai";
import {
  Box,
  Paper,
  Tab,
  Tabs,
  Chip,
  Typography,
  Accordion,
  AccordionSummary,
  AccordionDetails,
} from "@mui/material";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";

const DEBUG_WIDTH = 480;

const jsonColors = {
  key: "#9cdcfe",
  string: "#ce9178",
  number: "#b5cea8",
  boolean: "#569cd6",
  null: "#569cd6",
  bracket: "#808080",
  punctuation: "#808080",
} as const;

const partTypeColors: Record<string, { bg: string; fg: string }> = {
  text: { bg: "#2e7d32", fg: "#fff" },
  "step-start": { bg: "#616161", fg: "#fff" },
  tool: { bg: "#1565c0", fg: "#fff" },
  "dynamic-tool": { bg: "#7b1fa2", fg: "#fff" },
  data: { bg: "#e65100", fg: "#fff" },
  "source-url": { bg: "#00695c", fg: "#fff" },
};

function getPartColor(type: string): { bg: string; fg: string } {
  if (partTypeColors[type]) return partTypeColors[type];
  if (type.startsWith("tool-")) return partTypeColors["tool"];
  if (type.startsWith("data-")) return partTypeColors["data"];
  return { bg: "#616161", fg: "#fff" };
}

function JsonLine({
  indent,
  keyName,
  children,
}: {
  indent: number;
  keyName?: string | number;
  children: React.ReactNode;
}) {
  return (
    <Box component="div" sx={{ pl: `${indent * 14}px`, lineHeight: 1.6 }}>
      {keyName !== undefined && (
        <>
          <Box component="span" sx={{ color: typeof keyName === "number" ? jsonColors.number : jsonColors.key }}>
            {typeof keyName === "string" ? `"${keyName}"` : keyName}
          </Box>
          <Box component="span" sx={{ color: jsonColors.punctuation }}>
            :{" "}
          </Box>
        </>
      )}
      {children}
    </Box>
  );
}

const JsonValue = memo(function JsonValue({
  data,
  indentLevel = 0,
  keyName,
  defaultExpanded: forceExpanded = false,
}: {
  data: unknown;
  indentLevel?: number;
  keyName?: string | number;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(forceExpanded);

  if (data === null) {
    return (
      <JsonLine indent={indentLevel} keyName={keyName}>
        <Box component="span" sx={{ color: jsonColors.null }}>null</Box>
      </JsonLine>
    );
  }

  if (typeof data === "boolean") {
    return (
      <JsonLine indent={indentLevel} keyName={keyName}>
        <Box component="span" sx={{ color: jsonColors.boolean }}>{String(data)}</Box>
      </JsonLine>
    );
  }

  if (typeof data === "number") {
    return (
      <JsonLine indent={indentLevel} keyName={keyName}>
        <Box component="span" sx={{ color: jsonColors.number }}>{data}</Box>
      </JsonLine>
    );
  }

  if (typeof data === "string") {
    const display = data.length > 120 ? data.slice(0, 117) + "..." : data;
    return (
      <JsonLine indent={indentLevel} keyName={keyName}>
        <Box component="span" sx={{ color: jsonColors.string }}>"{display}"</Box>
      </JsonLine>
    );
  }

  if (Array.isArray(data)) {
    if (data.length === 0) {
      return (
        <JsonLine indent={indentLevel} keyName={keyName}>
          <Box component="span" sx={{ color: jsonColors.bracket }}>[]</Box>
        </JsonLine>
      );
    }

    const autoExpand = data.length <= 3;
    const isOpen = autoExpand || expanded;

    if (!isOpen) {
      return (
        <JsonLine indent={indentLevel} keyName={keyName}>
          <Box
            component="span"
            onClick={() => setExpanded(true)}
            sx={{ color: jsonColors.bracket, cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
          >
            [{`...${data.length} items`}]
          </Box>
        </JsonLine>
      );
    }

    return (
      <>
        <JsonLine indent={indentLevel} keyName={keyName}>
          <Box
            component="span"
            onClick={autoExpand ? undefined : () => setExpanded(false)}
            sx={{ color: jsonColors.bracket, cursor: autoExpand ? "default" : "pointer" }}
          >
            [
          </Box>
        </JsonLine>
        {data.map((item, i) => (
          <JsonValue key={i} data={item} indentLevel={indentLevel + 1} keyName={i} />
        ))}
        <JsonLine indent={indentLevel}>
          <Box component="span" sx={{ color: jsonColors.bracket }}>]</Box>
        </JsonLine>
      </>
    );
  }

  if (typeof data === "object") {
    const entries = Object.entries(data as Record<string, unknown>);

    if (entries.length === 0) {
      return (
        <JsonLine indent={indentLevel} keyName={keyName}>
          <Box component="span" sx={{ color: jsonColors.bracket }}>{"{}"}</Box>
        </JsonLine>
      );
    }

    const autoExpand = entries.length <= 3;
    const isOpen = autoExpand || expanded;

    if (!isOpen) {
      return (
        <JsonLine indent={indentLevel} keyName={keyName}>
          <Box
            component="span"
            onClick={() => setExpanded(true)}
            sx={{ color: jsonColors.bracket, cursor: "pointer", "&:hover": { textDecoration: "underline" } }}
          >
            {`{...${entries.length} entries}`}
          </Box>
        </JsonLine>
      );
    }

    return (
      <>
        <JsonLine indent={indentLevel} keyName={keyName}>
          <Box
            component="span"
            onClick={autoExpand ? undefined : () => setExpanded(false)}
            sx={{ color: jsonColors.bracket, cursor: autoExpand ? "default" : "pointer" }}
          >
            {"{"}
          </Box>
        </JsonLine>
        {entries.map(([k, v]) => (
          <JsonValue key={k} data={v} indentLevel={indentLevel + 1} keyName={k} />
        ))}
        <JsonLine indent={indentLevel}>
          <Box component="span" sx={{ color: jsonColors.bracket }}>{"}"}</Box>
        </JsonLine>
      </>
    );
  }

  return (
    <JsonLine indent={indentLevel} keyName={keyName}>
      <Box component="span" sx={{ color: jsonColors.string }}>{String(data)}</Box>
    </JsonLine>
  );
});

function PartItem({ part }: { part: Record<string, unknown> }) {
  const type = (part.type as string) || "unknown";
  const color = getPartColor(type);

  let preview = "";
  if (type === "text" && typeof part.text === "string") {
    preview = part.text.length > 60 ? part.text.slice(0, 57) + "..." : part.text;
  } else if (typeof part.toolName === "string") {
    preview = part.toolName;
  }

  const { type: _type, ...rest } = part;

  return (
    <Accordion
      disableGutters
      elevation={0}
      sx={{
        bgcolor: "#2d2d2d",
        borderLeft: `3px solid ${color.bg}`,
        "&:before": { display: "none" },
        "&:not(:last-child)": { mb: "2px" },
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon sx={{ color: "#808080", fontSize: 16 }} />}
        sx={{
          minHeight: 32,
          px: 1,
          "& .MuiAccordionSummary-content": { my: 0.5, alignItems: "center", gap: 1, minWidth: 0 },
        }}
      >
        <Chip
          label={type}
          size="small"
          sx={{
            bgcolor: color.bg,
            color: color.fg,
            fontSize: "0.65rem",
            height: 20,
            flexShrink: 0,
          }}
        />
        {preview && (
          <Typography
            variant="caption"
            sx={{
              color: "#999",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              fontSize: "0.65rem",
            }}
          >
            {preview}
          </Typography>
        )}
      </AccordionSummary>
      <AccordionDetails sx={{ p: 1, pt: 0 }}>
        <Box sx={{ fontFamily: "monospace", fontSize: "0.7rem", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          <JsonValue data={rest} defaultExpanded />
        </Box>
      </AccordionDetails>
    </Accordion>
  );
}

const MessageCard = memo(function MessageCard({
  message,
  index,
}: {
  message: { id: string; role: string; parts: Record<string, unknown>[] };
  index: number;
}) {
  const roleColor = message.role === "user" ? "primary" : "secondary";
  const truncatedId = message.id.length > 8 ? message.id.slice(0, 8) + "..." : message.id;

  return (
    <Paper
      variant="outlined"
      sx={{
        bgcolor: "#252526",
        borderColor: "#3e3e42",
        mb: 1,
        overflow: "hidden",
      }}
    >
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, px: 1, py: 0.5, borderBottom: "1px solid #3e3e42" }}>
        <Chip label={message.role} color={roleColor} size="small" sx={{ fontSize: "0.65rem", height: 20 }} />
        <Typography variant="caption" sx={{ color: "#808080", fontSize: "0.65rem" }}>
          #{index}
        </Typography>
        <Typography variant="caption" sx={{ color: "#606060", fontSize: "0.6rem", fontFamily: "monospace" }}>
          {truncatedId}
        </Typography>
        <Typography variant="caption" sx={{ color: "#606060", fontSize: "0.6rem", ml: "auto" }}>
          {message.parts.length} part{message.parts.length !== 1 ? "s" : ""}
        </Typography>
      </Box>
      <Box sx={{ p: 0.5 }}>
        {message.parts.map((part, i) => (
          <PartItem key={i} part={part} />
        ))}
      </Box>
    </Paper>
  );
});

export function DebugSidebar({
  rawMessages,
  messages,
}: {
  rawMessages: UIMessage[];
  messages: UIMessage[];
}) {
  const [tab, setTab] = useState(0);
  const data = tab === 0 ? rawMessages : messages;

  const stripped = useMemo(
    () =>
      data.map((m) => ({
        id: m.id,
        role: m.role,
        parts: m.parts.map((p) => {
          const { ...rest } = p as any;
          delete rest.callProviderMetadata;
          delete rest.providerMetadata;
          return rest;
        }),
      })),
    [data],
  );

  return (
    <Box
      sx={{
        width: DEBUG_WIDTH,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        borderLeft: "1px solid #3e3e42",
        bgcolor: "#1e1e1e",
        color: "#d4d4d4",
      }}
    >
      <Tabs
        value={tab}
        onChange={(_, v) => setTab(v)}
        variant="fullWidth"
        sx={{
          borderBottom: "1px solid #3e3e42",
          minHeight: 36,
          bgcolor: "#252526",
          "& .MuiTab-root": { color: "#808080", minHeight: 36, py: 0, fontSize: "0.75rem" },
          "& .Mui-selected": { color: "#d4d4d4 !important" },
          "& .MuiTabs-indicator": { bgcolor: "#007acc" },
        }}
      >
        <Tab label="Raw" />
        <Tab label="Transformed" />
      </Tabs>
      <Box
        sx={{
          flex: 1,
          overflowY: "auto",
          p: 1,
          "&::-webkit-scrollbar": { width: 8 },
          "&::-webkit-scrollbar-track": { bgcolor: "#1e1e1e" },
          "&::-webkit-scrollbar-thumb": { bgcolor: "#424242", borderRadius: 4 },
        }}
      >
        {stripped.map((msg, i) => (
          <MessageCard key={msg.id + tab} message={msg} index={i} />
        ))}
      </Box>
    </Box>
  );
}
