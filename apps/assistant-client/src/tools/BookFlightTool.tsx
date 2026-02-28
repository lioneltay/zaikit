import { useState } from "react";
import { Box, Button, TextField, Typography } from "@mui/material";
import type { BookFlightToolProps } from "./tools.generated";
import { ResolvedBanner } from "../components/ResolvedBanner";

export function BookFlightTool(props: BookFlightToolProps) {
  const flights = props.suspendPayload?.flights ?? [];
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [seat, setSeat] = useState<"window" | "aisle" | "middle">("window");

  if (props.state === "result") {
    return <ResolvedBanner>Flight selection — Resolved</ResolvedBanner>;
  }

  return (
    <Box
      sx={{
        p: 2,
        my: 1,
        border: "1px solid #2196F3",
        borderRadius: "12px",
        bgcolor: "#E3F2FD",
      }}
    >
      <Typography variant="body2" fontWeight={600} sx={{ mb: 1.5 }}>
        Select a Flight
      </Typography>
      <Box sx={{ display: "flex", flexDirection: "column", gap: 1, mb: 2 }}>
        {flights.map((f) => (
          <Box
            key={f.id}
            onClick={() => setSelectedId(f.id)}
            sx={{
              p: 1.5,
              cursor: "pointer",
              border: "1px solid",
              borderColor: selectedId === f.id ? "primary.main" : "#ccc",
              borderWidth: selectedId === f.id ? 2 : 1,
              borderRadius: "8px",
              bgcolor: selectedId === f.id ? "rgba(108,99,255,0.08)" : "#fff",
              "&:hover": { borderColor: "primary.light" },
              transition: "all 0.15s",
            }}
          >
            <Box
              sx={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Box>
                <Typography variant="body2" fontWeight={600}>
                  {f.airline} — {f.id}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Departs: {f.departure}
                </Typography>
              </Box>
              <Typography variant="body2" fontWeight={600} color="primary">
                ${f.price}
              </Typography>
            </Box>
          </Box>
        ))}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 2 }}>
        <Typography variant="body2">Seat preference:</Typography>
        <TextField
          select
          size="small"
          value={seat}
          onChange={(e) =>
            setSeat(e.target.value as "window" | "aisle" | "middle")
          }
          SelectProps={{ native: true }}
          sx={{ minWidth: 120 }}
        >
          <option value="window">Window</option>
          <option value="aisle">Aisle</option>
          <option value="middle">Middle</option>
        </TextField>
      </Box>
      <Button
        variant="contained"
        size="small"
        disabled={!selectedId}
        onClick={() => {
          if (!selectedId) return;
          props.resume({
            selectedFlightId: selectedId,
            seatPreference: seat,
          });
        }}
      >
        Book
      </Button>
    </Box>
  );
}
