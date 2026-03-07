import { DocsLayout } from "fumadocs-ui/layouts/docs";
import { Home, Newspaper } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { baseOptions } from "@/lib/layout.shared";
import { source } from "@/lib/source";

function SidebarGlobalLinks() {
  return (
    <div className="flex flex-col gap-1 border-b border-fd-border pb-3 mb-1">
      <Link
        href="/"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
      >
        <Home className="size-4" />
        Home
      </Link>
      <Link
        href="/blog"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground"
      >
        <Newspaper className="size-4" />
        Blog
      </Link>
    </div>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      {...baseOptions}
      sidebar={{
        banner: <SidebarGlobalLinks />,
      }}
    >
      {children}
    </DocsLayout>
  );
}
