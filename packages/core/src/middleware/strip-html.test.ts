import { describe, expect, it } from "vitest";
import { stripHtml } from "./strip-html";

type TextDelta = { type: "text-delta"; id: string; delta: string };
type Chunk = TextDelta | { type: string; [key: string]: unknown };

/**
 * Feed text-delta chunks through the stripHtml middleware and collect output.
 */
async function run(
  deltas: string[],
  options?: Parameters<typeof stripHtml>[0],
): Promise<Chunk[]> {
  const chunks: Chunk[] = deltas.map((delta) => ({
    type: "text-delta",
    id: "t",
    delta,
  }));

  const inputStream = new ReadableStream<Chunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });

  const mw = stripHtml(options);
  const handler = typeof mw === "function" ? mw : mw.handler;
  const resultStream = handler({} as any, () => inputStream);

  const output: Chunk[] = [];
  const reader = resultStream.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    output.push(value as Chunk);
  }
  return output;
}

/** Concatenate all text-delta chunks into a single string. */
function text(chunks: Chunk[]): string {
  return chunks
    .filter((c): c is TextDelta => c.type === "text-delta")
    .map((c) => c.delta)
    .join("");
}

// ---------------------------------------------------------------------------
// Default behaviour: remove entire elements (tags + content)
// ---------------------------------------------------------------------------

describe("stripHtml — default (remove elements)", () => {
  it("removes element with content", async () => {
    expect(text(await run(["<b>bold</b>"]))).toBe("");
  });

  it("removes element with attributes", async () => {
    expect(text(await run(['<div class="x">text</div>']))).toBe("");
  });

  it("removes self-closing tags", async () => {
    expect(text(await run(["Hello<br />world"]))).toBe("Helloworld");
  });

  it("removes void elements without slash", async () => {
    expect(text(await run(["Hello<br>world"]))).toBe("Helloworld");
  });

  it("removes void elements with attributes", async () => {
    expect(text(await run(['Hello<img src="x.png">world']))).toBe("Helloworld");
  });

  it("preserves text around removed elements", async () => {
    expect(text(await run(["before<div>inside</div>after"]))).toBe(
      "beforeafter",
    );
  });

  it("removes nested elements entirely", async () => {
    expect(
      text(
        await run(['<div class="outer"><span><b>hello</b> world</span></div>']),
      ),
    ).toBe("");
  });

  it("removes deeply nested list", async () => {
    expect(
      text(
        await run([
          "<ul><li>one</li><li><a href='#'>two</a></li><li>three</li></ul>",
        ]),
      ),
    ).toBe("");
  });

  it("strips orphaned closing tags", async () => {
    expect(text(await run(["content</div>more"]))).toBe("contentmore");
  });

  it("strips HTML comments", async () => {
    expect(text(await run(["before<!-- comment -->after"]))).toBe(
      "beforeafter",
    );
  });

  it("preserves bare < and >", async () => {
    expect(text(await run(["3 < 5 and 10 > 7"]))).toBe("3 < 5 and 10 > 7");
  });

  it("preserves fenced code blocks", async () => {
    const input = "Here is code:\n```html\n<div>hi</div>\n```\nDone";
    expect(text(await run([input]))).toBe(input);
  });

  it("preserves inline code", async () => {
    expect(text(await run(["Use `<div>` for containers"]))).toBe(
      "Use `<div>` for containers",
    );
  });

  it("passes non-text-delta chunks through unchanged", async () => {
    const inputStream = new ReadableStream<Chunk>({
      start(controller) {
        controller.enqueue({ type: "start" });
        controller.enqueue({
          type: "text-delta",
          id: "t",
          delta: "<b>hi</b>",
        });
        controller.enqueue({ type: "finish" });
        controller.close();
      },
    });

    const mw = stripHtml();
    const handler = typeof mw === "function" ? mw : mw.handler;
    const resultStream = handler({} as any, () => inputStream);
    const output: Chunk[] = [];
    const reader = resultStream.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      output.push(value as Chunk);
    }

    expect(output).toEqual([{ type: "start" }, { type: "finish" }]);
  });

  it("drops empty deltas when chunk is entirely an element", async () => {
    const out = await run(["<div>gone</div>"]);
    expect(out.filter((c) => c.type === "text-delta")).toHaveLength(0);
  });

  it("handles tags split across chunks", async () => {
    expect(text(await run(["<di", "v>content</div>"]))).toBe("");
  });

  it("handles bare bracket split (not a tag)", async () => {
    expect(text(await run(["3 <", " 5"]))).toBe("3 < 5");
  });
});

// ---------------------------------------------------------------------------
// Transform option: customise per-element behaviour
// ---------------------------------------------------------------------------

describe("stripHtml — transform option", () => {
  it("keeps all text content when transform returns content", async () => {
    const out = await run(["Hello <b>bold</b> world"], {
      transform: (_tag, content) => content,
    });
    expect(text(out)).toBe("Hello bold world");
  });

  it("replaces element with custom text", async () => {
    const out = await run(["<b>important</b>"], {
      transform: (tag, content) => (tag === "b" ? `**${content}**` : content),
    });
    expect(text(out)).toBe("**important**");
  });

  it("selectively removes elements", async () => {
    const out = await run(["keep <b>this</b> remove <script>evil</script>"], {
      transform: (tag, content) => (tag === "script" ? undefined : content),
    });
    expect(text(out)).toBe("keep this remove ");
  });

  it("handles nested elements with transform", async () => {
    const out = await run(["<div><b>hello</b> world</div>"], {
      transform: (_tag, content) => content,
    });
    // Inner <b> transform returns "hello", then outer <div> gets "hello world"
    expect(text(out)).toBe("hello world");
  });

  it("transform receives empty content for void elements", async () => {
    const calls: [string, string][] = [];
    await run(["text<br>more"], {
      transform: (tag, content) => {
        calls.push([tag, content]);
        return undefined;
      },
    });
    expect(calls).toEqual([["br", ""]]);
  });

  it("transform can replace void elements", async () => {
    const out = await run(["line1<br>line2"], {
      transform: (tag) => (tag === "br" ? "\n" : undefined),
    });
    expect(text(out)).toBe("line1\nline2");
  });
});

// ---------------------------------------------------------------------------
// Tags option: limit which tags are removed
// ---------------------------------------------------------------------------

describe("stripHtml — tags option", () => {
  it("only removes targeted tags, keeps content of others", async () => {
    const out = await run(["keep <b>this</b> remove <script>evil</script>"], {
      tags: ["script"],
    });
    expect(text(out)).toBe("keep this remove ");
  });

  it("removes targeted nested element but preserves outer", async () => {
    const out = await run(["<div><script>bad</script>hello</div>"], {
      tags: ["script"],
    });
    expect(text(out)).toBe("hello");
  });

  it("removes targeted outer element including non-targeted children", async () => {
    const out = await run(["<div><b>bold</b></div>"], { tags: ["div"] });
    expect(text(out)).toBe("");
  });

  it("tags option is case-insensitive", async () => {
    const out = await run(["<SCRIPT>evil</SCRIPT> ok"], { tags: ["script"] });
    expect(text(out)).toBe(" ok");
  });

  it("works with transform for targeted tags only", async () => {
    const out = await run(["<b>bold</b> <i>italic</i>"], {
      tags: ["b"],
      transform: (_tag, content) => `[${content}]`,
    });
    // <b> is targeted → transform returns "[bold]"
    // <i> is not targeted → content preserved as-is
    expect(text(out)).toBe("[bold] italic");
  });
});

// ---------------------------------------------------------------------------
// ignoreCodeBlocks option
// ---------------------------------------------------------------------------

describe("stripHtml — ignoreCodeBlocks option", () => {
  it("preserves code blocks by default", async () => {
    const input = "before\n```\n<div>code</div>\n```\nafter";
    expect(text(await run([input]))).toBe(input);
  });

  it("strips inside code blocks when ignoreCodeBlocks is false", async () => {
    const input = "before\n```\n<div>code</div>\n```\nafter";
    const out = await run([input], { ignoreCodeBlocks: false });
    expect(text(out)).toBe("before\n```\n\n```\nafter");
  });

  it("preserves inline code by default", async () => {
    expect(text(await run(["Use `<div>` here"]))).toBe("Use `<div>` here");
  });

  it("treats backtick-wrapped HTML as real tags when ignoreCodeBlocks is false", async () => {
    // Without code-block awareness, `<div>` is a real opening tag.
    // The unclosed div swallows the trailing backtick and text.
    const out = await run(["Use `<div>` here"], { ignoreCodeBlocks: false });
    expect(text(out)).toBe("Use `");
  });
});
