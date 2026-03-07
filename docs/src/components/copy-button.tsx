"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

export function CopyButton({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
      className={`cursor-pointer transition-colors hover:text-fd-foreground ${className ?? ""}`}
      aria-label="Copy to clipboard"
    >
      {copied ? (
        <Check className="size-4 text-fd-primary" />
      ) : (
        <Copy className="size-4" />
      )}
    </button>
  );
}
