import { DocsLayout } from "fumadocs-ui/layouts/docs";
import Image from "next/image";
import type { ReactNode } from "react";
import { source } from "@/lib/source";
import logo from "../icon.svg";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <DocsLayout
      tree={source.pageTree}
      nav={{
        title: (
          <>
            <Image src={logo} alt="ZAIKit" width={24} height={24} />
            ZAIKit
          </>
        ),
      }}
    >
      {children}
    </DocsLayout>
  );
}
