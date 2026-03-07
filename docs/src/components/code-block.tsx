import { Terminal } from "lucide-react";
import { codeToHtml, type ThemeRegistration } from "shiki";
import { CopyButton } from "./copy-button";

/**
 * ZAIKit code theme — Graphite & Emerald
 * Matches the brand palette: emerald accent, muted graphite base.
 */
const zaikitTheme: ThemeRegistration = {
  name: "zaikit",
  type: "dark",
  colors: {
    "editor.background": "#1a1a1f",
    "editor.foreground": "#c8c8cc",
  },
  tokenColors: [
    // Comments
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "#555560", fontStyle: "italic" },
    },
    // Keywords: import, const, return, async, await, export, default, function
    {
      scope: [
        "keyword",
        "storage.type",
        "storage.modifier",
        "keyword.control",
        "variable.language.this",
      ],
      settings: { foreground: "#b392e9" },
    },
    // Functions
    {
      scope: [
        "entity.name.function",
        "support.function",
        "meta.function-call entity.name.function",
      ],
      settings: { foreground: "#6ec8e6" },
    },
    // Strings — emerald brand color
    {
      scope: ["string"],
      settings: { foreground: "#5ce0a0" },
    },
    // Variables (named imports, identifiers, objects, parameters)
    {
      scope: [
        "variable.other.readwrite.alias",
        "variable.other.readwrite",
        "variable.other.object",
        "variable.parameter",
      ],
      settings: { foreground: "#e0c590" },
    },
    // Destructured constants (const { x } = ...)
    {
      scope: ["variable.other.constant"],
      settings: { foreground: "#d4c4a0" },
    },
    // Variables (general fallback)
    {
      scope: ["variable", "meta.object-literal.key"],
      settings: { foreground: "#c8c8cc" },
    },
    // Object properties (all levels of property access)
    {
      scope: [
        "variable.other.property",
        "variable.other.object.property",
        "support.variable.property",
      ],
      settings: { foreground: "#a0b8cc" },
    },
    // Constants, numbers, booleans
    {
      scope: ["constant", "constant.numeric", "constant.language"],
      settings: { foreground: "#e0a56c" },
    },
    // Types & interfaces
    {
      scope: [
        "entity.name.type",
        "support.type",
        "entity.other.inherited-class",
      ],
      settings: { foreground: "#6ec8e6" },
    },
    // JSX/HTML tags — teal, distinct from string green
    {
      scope: ["entity.name.tag"],
      settings: { foreground: "#70c0b0" },
    },
    // JSX components — cyan like types
    {
      scope: ["support.class.component"],
      settings: { foreground: "#6ec8e6" },
    },
    // Tag punctuation (< > />)
    {
      scope: ["punctuation.definition.tag"],
      settings: { foreground: "#70c0b0" },
    },
    // JSX/HTML attributes
    {
      scope: ["entity.other.attribute-name"],
      settings: { foreground: "#b392e9" },
    },
    // Punctuation & operators
    {
      scope: ["punctuation", "keyword.operator", "meta.brace"],
      settings: { foreground: "#888890" },
    },
  ],
};

type CodeBlockProps = {
  code: string;
  lang?: string;
  filename?: string;
  terminal?: boolean;
  className?: string;
};

export async function CodeBlock({
  code,
  lang = "typescript",
  filename,
  terminal = false,
  className,
}: CodeBlockProps) {
  const html = await codeToHtml(code.trim(), {
    lang,
    theme: zaikitTheme,
  });

  return (
    <div
      className={`min-w-0 overflow-hidden rounded-2xl border border-fd-border/60 bg-fd-card/80 shadow-2xl shadow-black/20 backdrop-blur-sm ${className ?? ""}`}
    >
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-fd-border/60 px-4 py-3">
        {terminal ? (
          <Terminal className="size-3.5 text-fd-muted-foreground/60" />
        ) : (
          <div className="flex gap-1.5">
            <div className="size-3 rounded-full bg-[#ff5f57]" />
            <div className="size-3 rounded-full bg-[#febc2e]" />
            <div className="size-3 rounded-full bg-[#28c840]" />
          </div>
        )}
        <div className="flex-1 text-center">
          {filename && (
            <span className="rounded-md bg-fd-muted/50 px-3 py-0.5 font-mono text-xs text-fd-muted-foreground">
              {filename}
            </span>
          )}
        </div>
        <CopyButton
          text={code.trim()}
          className="text-fd-muted-foreground/40"
        />
      </div>

      {/* Code — shiki returns sanitized HTML */}
      <div
        className="overflow-x-auto p-6 [&_pre]:!bg-transparent [&_pre]:!p-0 [&_code]:font-mono [&_code]:text-[13px] [&_code]:leading-relaxed"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: shiki output is safe
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
