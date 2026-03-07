import { HomeLayout } from "fumadocs-ui/layouts/home";
import type { ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <div
      className="dark bg-fd-background text-fd-foreground"
      style={{ colorScheme: "dark" }}
    >
      <HomeLayout
        {...baseOptions}
        themeSwitch={{ enabled: false }}
        links={[
          { text: "Docs", url: "/docs" },
          { text: "Blog", url: "/blog" },
        ]}
      >
        {children}
      </HomeLayout>
    </div>
  );
}
