import { createTheme, useMediaQuery } from "@mui/material";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

const STORAGE_KEY = "zaikit-sandbox-color-mode";

export type ColorMode = "light" | "dark";

// ---------------------------------------------------------------------------
// Color tokens — keyed by mode, consumed by components via useTokens()
// ---------------------------------------------------------------------------

export const colorTokens = {
  light: {
    sidebar: {
      bg: "#f5f5f7",
      border: "#e0e0e0",
      textPrimary: "#333333",
      textSecondary: "#666666",
      textMuted: "#999999",
      chipBg: "rgba(0,0,0,0.06)",
      hoverBg: "rgba(0,0,0,0.04)",
      selectedBg: "rgba(16,185,129,0.1)",
      selectedHoverBg: "rgba(16,185,129,0.15)",
      iconColor: "rgba(0,0,0,0.45)",
      iconMuted: "rgba(0,0,0,0.3)",
      scrollbar: "rgba(0,0,0,0.2) transparent",
    },
    code: {
      preBg: "#1e1e1e",
      preColor: "#d4d4d4",
      inlineBg: "#f0f0f3",
      inlineColor: "#10B981",
    },
    schema: {
      input: "#f5f5f5",
      suspend: "#fff3e0",
      resume: "#e3f2fd",
      output: "#e8f5e9",
      systemPrompt: "#f5f5f5",
    },
    syntax: {
      brace: "#1e1e1e",
      key: "#0451a5",
      type: "#267f99",
      string: "#a31515",
      punctuation: "#1e1e1e",
      optional: "#717171",
    },
    markdown: {
      blockquoteBorder: "#ccc",
      blockquoteColor: "#666",
      tableBorder: "#ddd",
      tableHeaderBg: "#f5f5f5",
    },
  },
  dark: {
    sidebar: {
      bg: "#161616",
      border: "#2a2a2a",
      textPrimary: "#e0e0e0",
      textSecondary: "#8b8b99",
      textMuted: "#6b6b78",
      chipBg: "rgba(255,255,255,0.08)",
      hoverBg: "rgba(255,255,255,0.06)",
      selectedBg: "rgba(16,185,129,0.15)",
      selectedHoverBg: "rgba(16,185,129,0.2)",
      iconColor: "rgba(255,255,255,0.5)",
      iconMuted: "rgba(255,255,255,0.3)",
      scrollbar: "rgba(255,255,255,0.2) transparent",
    },
    code: {
      preBg: "#0d0d0d",
      preColor: "#d4d4d4",
      inlineBg: "#2a2a2a",
      inlineColor: "#6ee7b7",
    },
    schema: {
      input: "#2a2a2a",
      suspend: "#3e2a00",
      resume: "#0a2a3e",
      output: "#1a3a1e",
      systemPrompt: "#2a2a2a",
    },
    syntax: {
      brace: "#d4d4d4",
      key: "#9cdcfe",
      type: "#4ec9b0",
      string: "#ce9178",
      punctuation: "#d4d4d4",
      optional: "#808080",
    },
    markdown: {
      blockquoteBorder: "#555",
      blockquoteColor: "#aaa",
      tableBorder: "#444",
      tableHeaderBg: "#2a2a2a",
    },
  },
};

export type Tokens = (typeof colorTokens)["light"];

// ---------------------------------------------------------------------------
// MUI themes
// ---------------------------------------------------------------------------

const shared = {
  typography: {
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
} as const;

export const lightTheme = createTheme({
  ...shared,
  palette: {
    mode: "light",
    primary: { main: "#10B981" },
    background: { default: "#ffffff", paper: "#ffffff" },
  },
});

export const darkTheme = createTheme({
  ...shared,
  palette: {
    mode: "dark",
    primary: { main: "#34d399" },
    background: { default: "#121212", paper: "#1e1e1e" },
  },
});

// ---------------------------------------------------------------------------
// Context + hook
// ---------------------------------------------------------------------------

type ColorModeContextValue = {
  mode: ColorMode;
  toggleMode: () => void;
};

export const ColorModeContext = createContext<ColorModeContextValue>({
  mode: "light",
  toggleMode: () => {},
});

export function useColorMode() {
  return useContext(ColorModeContext);
}

/** Returns the color tokens for the current theme mode. */
export function useTokens(): Tokens {
  const { mode } = useColorMode();
  return colorTokens[mode];
}

// ---------------------------------------------------------------------------
// Hook for managing color mode state (used in ThemeRoot)
// ---------------------------------------------------------------------------

export function useColorModeState() {
  const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");

  const [mode, setMode] = useState<ColorMode>(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ColorMode | null;
    if (stored === "light" || stored === "dark") return stored;
    return prefersDark ? "dark" : "light";
  });

  // Track OS changes when no explicit user choice
  useEffect(() => {
    if (!localStorage.getItem(STORAGE_KEY)) {
      setMode(prefersDark ? "dark" : "light");
    }
  }, [prefersDark]);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "light" ? "dark" : "light";
      localStorage.setItem(STORAGE_KEY, next);
      return next;
    });
  }, []);

  const theme = mode === "dark" ? darkTheme : lightTheme;

  return { mode, toggleMode, theme };
}
