import { createTheme, ThemeProvider } from "@mui/material/styles";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const theme = createTheme({
  typography: {
    fontFamily: "Inter, system-ui, -apple-system, sans-serif",
  },
  palette: {
    mode: "light",
    primary: { main: "#6C63FF" },
    background: { default: "#f7f7f8", paper: "#ffffff" },
  },
  shape: { borderRadius: 12 },
  components: {
    MuiCssBaseline: {
      styleOverrides: `
        * {
          scrollbar-width: thin;
          scrollbar-color: rgba(0,0,0,0.18) transparent;
        }
        *::-webkit-scrollbar {
          width: 6px;
          height: 6px;
        }
        *::-webkit-scrollbar-track {
          background: transparent;
        }
        *::-webkit-scrollbar-thumb {
          background: rgba(0,0,0,0.18);
          border-radius: 3px;
        }
        *::-webkit-scrollbar-thumb:hover {
          background: rgba(0,0,0,0.3);
        }
      `,
    },
    MuiButton: {
      styleOverrides: {
        root: { textTransform: "none", fontWeight: 600 },
      },
    },
    MuiTextField: {
      defaultProps: { variant: "outlined" },
      styleOverrides: {
        root: {
          "& .MuiOutlinedInput-root": { borderRadius: 12 },
        },
      },
    },
  },
});

createRoot(document.getElementById("root") as HTMLElement).render(
  <StrictMode>
    <ThemeProvider theme={theme}>
      <App />
    </ThemeProvider>
  </StrictMode>,
);
