import { RootProvider } from "fumadocs-ui/provider/next";
import type { Metadata } from "next";
import { JetBrains_Mono, Outfit } from "next/font/google";
import type { ReactNode } from "react";
import "./global.css";

export const metadata: Metadata = {
  title: {
    template: "%s",
    default: "ZAIKit",
  },
};

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jb-mono",
});

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="en"
      className={`${outfit.variable} ${jetbrainsMono.variable}`}
      suppressHydrationWarning
    >
      <body className="flex min-h-screen flex-col font-sans antialiased">
        <RootProvider theme={{ defaultTheme: "dark" }}>{children}</RootProvider>
      </body>
    </html>
  );
}
