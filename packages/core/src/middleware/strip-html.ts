import type { Middleware } from "./core";

const VOID_ELEMENTS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

export type StripHtmlOptions = {
  /**
   * Limit removal to specific tag names (case-insensitive).
   * When set, only listed tags are removed — other tags are stripped
   * but their text content is preserved.
   *
   * When omitted, all HTML elements are removed.
   */
  tags?: string[];
  /**
   * Called for each targeted HTML element that would be removed.
   * Receives the tag name and the text content inside the element
   * (inner tags already stripped).
   *
   * Return a string to replace the element, or `undefined` to remove it.
   */
  transform?: (tag: string, content: string) => string | undefined;
  /**
   * When `true` (default), HTML inside fenced code blocks and inline code
   * is left untouched. Set to `false` to process HTML everywhere.
   */
  ignoreCodeBlocks?: boolean;
};

/**
 * Middleware that removes HTML elements from `text-delta` chunks.
 *
 * By default, entire elements (open tag + content + close tag) are removed.
 *
 * Options:
 * - `tags` — limit removal to specific tags; others are stripped but keep content
 * - `transform` — called per-element to customise replacement text
 * - `ignoreCodeBlocks` — preserve HTML inside fenced / inline code (default `true`)
 *
 * Bare angle brackets (e.g. `3 < 5`) are always preserved.
 */
export function stripHtml(options?: StripHtmlOptions): Middleware {
  const transformFn = options?.transform;
  const targetTags = options?.tags
    ? new Set(options.tags.map((t) => t.toLowerCase()))
    : null;
  const ignoreCodeBlocks = options?.ignoreCodeBlocks ?? true;

  return (_ctx, next) => {
    let state: "text" | "afterLt" | "tagName" | "inTag" = "text";
    let depth = 0;
    let isClosingTag = false;
    let tagNameBuffer = "";
    let prevCharInTag = "";
    const elementStack: {
      tagName: string;
      content: string;
      targeted: boolean;
    }[] = [];
    let inCodeBlock = false;
    let inInlineCode = false;
    let linePos = 0;
    let fenceBackticks = 0;
    let cleaned = "";

    /** Route text to output (depth 0) or the current element's content buffer. */
    function emit(text: string) {
      if (depth === 0) {
        cleaned += text;
      } else if (elementStack.length > 0) {
        elementStack[elementStack.length - 1].content += text;
      }
    }

    /** Is this tag targeted for removal? */
    function isTargeted(tagName: string): boolean {
      return targetTags === null || targetTags.has(tagName);
    }

    /** Handle a completed tag (opening, closing, void, self-closing, comment). */
    function onTagComplete() {
      const isVoid = VOID_ELEMENTS.has(tagNameBuffer);
      const isSelfClosing =
        !isClosingTag && prevCharInTag === "/" && state === "inTag";
      const isComment = tagNameBuffer.startsWith("!");

      if (isClosingTag) {
        if (elementStack.length === 0) return; // orphaned close tag
        const elem = elementStack.pop()!;
        depth = Math.max(0, depth - 1);
        if (!elem.targeted) {
          // Non-targeted: always keep content (strip tags only)
          emit(elem.content);
        } else if (transformFn) {
          const replacement = transformFn(elem.tagName, elem.content);
          if (replacement !== undefined) emit(replacement);
        }
      } else if (isComment) {
        // Comments / doctypes: strip with no depth change
      } else if (isVoid || isSelfClosing) {
        if (isTargeted(tagNameBuffer) && transformFn) {
          const replacement = transformFn(tagNameBuffer, "");
          if (replacement !== undefined) emit(replacement);
        }
      } else {
        // Opening tag: push onto stack
        elementStack.push({
          tagName: tagNameBuffer,
          content: "",
          targeted: isTargeted(tagNameBuffer),
        });
        depth++;
      }
    }

    return next().pipeThrough(
      new TransformStream<unknown, unknown>({
        transform(chunk: any, controller) {
          if (chunk.type !== "text-delta") {
            controller.enqueue(chunk);
            return;
          }

          cleaned = "";

          for (const char of chunk.delta) {
            // --- Code-fence and inline-code tracking (depth 0 only) ---
            if (ignoreCodeBlocks && depth === 0) {
              if (char === "\n") {
                if (fenceBackticks >= 3) {
                  inCodeBlock = !inCodeBlock;
                  state = "text";
                }
                linePos = 0;
                fenceBackticks = 0;
                cleaned += char;
                continue;
              }

              if (linePos === fenceBackticks && char === "`") {
                fenceBackticks++;
                linePos++;
                cleaned += char;
                continue;
              }

              linePos++;

              if (inCodeBlock) {
                cleaned += char;
                continue;
              }

              if (char === "`") {
                inInlineCode = !inInlineCode;
                cleaned += char;
                continue;
              }

              if (inInlineCode) {
                cleaned += char;
                continue;
              }
            }

            // --- Tag / depth state machine ---
            switch (state) {
              case "text":
                if (char === "<") {
                  state = "afterLt";
                } else {
                  emit(char);
                }
                break;

              case "afterLt":
                if (char === "/") {
                  isClosingTag = true;
                  tagNameBuffer = "";
                  state = "tagName";
                } else if (/[a-zA-Z!]/.test(char)) {
                  isClosingTag = false;
                  tagNameBuffer = char.toLowerCase();
                  state = "tagName";
                } else {
                  // Bare angle bracket (e.g. `3 < 5`)
                  emit("<" + char);
                  state = "text";
                }
                break;

              case "tagName":
                if (char === ">") {
                  onTagComplete();
                  state = "text";
                } else if (" \t\n/".includes(char)) {
                  prevCharInTag = char;
                  state = "inTag";
                } else {
                  tagNameBuffer += char.toLowerCase();
                }
                break;

              case "inTag":
                if (char === ">") {
                  onTagComplete();
                  state = "text";
                } else {
                  prevCharInTag = char;
                }
                break;
            }
          }

          if (cleaned) {
            controller.enqueue({ ...chunk, delta: cleaned });
          }
        },
      }),
    );
  };
}
