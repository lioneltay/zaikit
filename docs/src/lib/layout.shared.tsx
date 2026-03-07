import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";
import Image from "next/image";
import logo from "@/app/icon.svg";

export const baseOptions: BaseLayoutProps = {
  nav: {
    title: (
      <>
        <Image src={logo} alt="ZAIKit" width={24} height={24} />
        ZAIKit
      </>
    ),
    url: "/",
  },
  githubUrl: "https://github.com/lioneltay/zaikit",
};
