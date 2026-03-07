import {
  ArrowRight,
  Bug,
  Copy,
  Cpu,
  Database,
  Layers,
  Puzzle,
  Radio,
  Shield,
  Terminal,
  UserCheck,
  Zap,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import logo from "@/app/icon.svg";
import { CodeBlock } from "@/components/code-block";

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}

/* ─── Hero ─── */
function Hero() {
  return (
    <section className="relative flex min-h-[calc(100vh-4rem)] flex-col items-center justify-center overflow-hidden px-4 text-center">
      {/* Radial glow behind logo */}
      <div className="pointer-events-none absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
        <div className="h-[600px] w-[600px] rounded-full bg-[oklch(0.7_0.17_162/0.06)] blur-[150px]" />
      </div>

      {/* Subtle grid */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.3) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
        }}
      />

      <div className="relative z-10">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-fd-border/60 bg-fd-card/50 px-4 py-1.5 text-xs font-medium text-fd-muted-foreground backdrop-blur-sm">
          <Zap className="size-3 text-fd-primary" />
          New: Suspend &amp; resume for human-in-the-loop
        </div>

        <Image
          src={logo}
          alt=""
          width={72}
          height={72}
          className="mx-auto mb-8"
        />

        <h1 className="mb-6 text-5xl font-bold tracking-[-0.04em] sm:text-7xl lg:text-8xl">
          Build AI agents
          <br />
          <span className="text-fd-primary">in TypeScript</span>
        </h1>

        <p className="mx-auto mb-10 max-w-2xl text-lg leading-relaxed text-fd-muted-foreground sm:text-xl">
          The full-stack TypeScript framework for building AI agents — tools,
          streaming, persistence, and end-to-end type safety out of the box.
        </p>

        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/docs"
            className="group inline-flex items-center gap-2 rounded-xl bg-fd-primary px-7 py-3.5 text-sm font-semibold text-fd-primary-foreground transition-all hover:brightness-110"
          >
            Get Started
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="https://github.com/lioneltay/zaikit"
            className="inline-flex items-center gap-2 rounded-xl border border-fd-border px-7 py-3.5 text-sm font-semibold transition-colors hover:bg-fd-accent"
          >
            <GitHubIcon className="size-4" />
            GitHub
          </a>
        </div>

        {/* Install command */}
        <div className="mx-auto mt-8 inline-flex items-center gap-3 rounded-xl border border-fd-border/40 bg-fd-card/30 px-5 py-2.5 font-mono text-sm text-fd-muted-foreground backdrop-blur-sm">
          <Terminal className="size-4 text-fd-muted-foreground/60" />
          <span>
            <span className="text-fd-primary">pnpm</span> add @zaikit/core
            @zaikit/react
          </span>
          <Copy className="size-3.5 text-fd-muted-foreground/40" />
        </div>
      </div>
    </section>
  );
}

/* ─── Code Showcase ─── */
const serverCode = `import { createAgent, createTool } from "@zaikit/core"
import { postgresMemory } from "@zaikit/memory-postgres"
import { openai } from "@ai-sdk/openai"
import { Hono } from "hono"
import { serve } from "@hono/node-server"
import { z } from "zod"

const weather = createTool({
  description: "Get the weather for a city",
  inputSchema: z.object({ city: z.string() }),
  execute: async ({ input }) => ({
    temp: 22, unit: "°C", city: input.city,
  }),
})

const agent = createAgent({
  model: openai("gpt-4o"),
  tools: { weather },
  memory: postgresMemory({
    connectionString: process.env.DATABASE_URL!,
  }),
})

const app = new Hono()
app.post("/api/chat", async (c) =>
  agent.chat(await c.req.json())
)
serve({ fetch: app.fetch, port: 3000 })`;

const clientCode = `import { AgentProvider, useAgent } from "@zaikit/react"
import { useToolRenderer } from "./generated/tools"

function Chat() {
  const { messages, renderToolPart } = useAgent()

  useToolRenderer("weather", (props) =>
    props.state === "call"
      ? <p>Loading weather for {props.args.city}...</p>
      : <p>{props.result.city}: {props.result.temp}°C</p>
  )

  return messages.map((msg) => (
    <div key={msg.id}>
      {msg.parts.map((part, i) =>
        part.type === "text"
          ? <p key={i}>{part.text}</p>
          : renderToolPart(part)
      )}
    </div>
  ))
}

export default function App() {
  return (
    <AgentProvider
      api="/api/chat"
      threadId="demo"
      initialMessages={[]}
    >
      <Chat />
    </AgentProvider>
  )
}`;

async function CodeShowcase() {
  return (
    <section className="relative px-4 pb-32">
      <div className="mx-auto max-w-6xl">
        <div className="mb-12 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Full stack in seconds
          </h2>
          <p className="mx-auto max-w-2xl text-fd-muted-foreground">
            Define your agent on the server, connect from React with a hook.
            Type safety flows through the entire stack via codegen.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col">
            <p className="mb-3 text-sm font-medium text-fd-muted-foreground">
              <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-fd-primary/10 text-xs font-bold text-fd-primary">
                1
              </span>
              Define your agent and tools
            </p>
            <CodeBlock
              code={serverCode}
              filename="server.ts"
              className="flex-1"
            />
          </div>
          <div className="flex min-w-0 flex-col">
            <p className="mb-3 text-sm font-medium text-fd-muted-foreground">
              <span className="mr-2 inline-flex size-5 items-center justify-center rounded-full bg-fd-primary/10 text-xs font-bold text-fd-primary">
                2
              </span>
              Connect your React frontend
            </p>
            <CodeBlock
              code={clientCode}
              filename="App.tsx"
              lang="tsx"
              className="flex-1"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── Features ─── */
const features = [
  {
    icon: Cpu,
    title: "Full-Stack Agents",
    description:
      "Define tools on the server, connect from React with a single provider. One framework for the entire stack.",
  },
  {
    icon: Radio,
    title: "Real-Time Streaming",
    description:
      "Responses stream over SSE with zero configuration. Token-by-token updates, tool calls, and status changes — all live.",
  },
  {
    icon: Puzzle,
    title: "Type-Safe Tool Rendering",
    description:
      "Map tool calls to React components with full type inference via codegen. No manual typing, no runtime surprises.",
  },
  {
    icon: UserCheck,
    title: "Human-in-the-Loop",
    description:
      "Tools can suspend for user input and resume seamlessly. Build approval flows, confirmations, and interactive workflows.",
  },
  {
    icon: Database,
    title: "Built-in Persistence",
    description:
      "Plug in PostgreSQL or in-memory storage. Conversations persist across sessions with thread management built in.",
  },
  {
    icon: Bug,
    title: "Dev Sandbox",
    description:
      "Inspect tool calls, debug agent behavior, and test tools in isolation. A purpose-built UI for agent development.",
  },
];

function Features() {
  return (
    <section className="relative px-4 py-24">
      {/* Section glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
        <div className="h-px w-full max-w-[600px] bg-gradient-to-r from-transparent via-fd-primary/40 to-transparent" />
      </div>

      <div className="mx-auto max-w-6xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Everything you need to build agents
          </h2>
          <p className="mx-auto max-w-2xl text-fd-muted-foreground">
            From server-side tool execution to browser rendering, ZAIKit handles
            the hard parts so you can focus on what your agent does.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="group relative rounded-2xl border border-fd-border/50 bg-fd-card/40 p-6 transition-all hover:border-fd-primary/30 hover:bg-fd-card/70"
            >
              <div className="mb-4 inline-flex rounded-xl border border-fd-border/50 bg-fd-muted/30 p-2.5">
                <feature.icon className="size-5 text-fd-primary" />
              </div>
              <h3 className="mb-2 text-lg font-semibold">{feature.title}</h3>
              <p className="text-sm leading-relaxed text-fd-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Architecture Diagram ─── */
function Architecture() {
  return (
    <section className="relative px-4 py-24">
      <div className="mx-auto max-w-4xl">
        <div className="mb-16 text-center">
          <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
            Server to browser, fully typed
          </h2>
          <p className="mx-auto max-w-2xl text-fd-muted-foreground">
            Your agent definition flows from server to client. Codegen bridges
            the gap with zero-config type safety.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          {[
            {
              icon: Layers,
              label: "Server",
              title: "Define",
              description: "createAgent + createTool with Zod schemas",
            },
            {
              icon: Zap,
              label: "Transport",
              title: "Stream",
              description: "SSE streaming with tool calls, data, and status",
            },
            {
              icon: Shield,
              label: "Client",
              title: "Render",
              description: "Type-safe React components via codegen",
            },
          ].map((step, i) => (
            <div key={step.title} className="relative">
              <div className="rounded-2xl border border-fd-border/50 bg-fd-card/40 p-6">
                <div className="mb-3 flex items-center gap-2">
                  <span className="flex size-6 items-center justify-center rounded-full bg-fd-primary/10 font-mono text-xs font-bold text-fd-primary">
                    {i + 1}
                  </span>
                  <span className="text-xs font-medium uppercase tracking-wider text-fd-muted-foreground">
                    {step.label}
                  </span>
                </div>
                <step.icon className="mb-3 size-8 text-fd-primary/70" />
                <h3 className="mb-1 text-lg font-semibold">{step.title}</h3>
                <p className="text-sm text-fd-muted-foreground">
                  {step.description}
                </p>
              </div>
              {i < 2 && (
                <div className="pointer-events-none absolute top-1/2 -right-4 z-10 hidden -translate-y-1/2 text-fd-primary/50 md:block">
                  <ArrowRight className="size-6" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Packages ─── */
function Packages() {
  return (
    <section className="relative px-4 py-24">
      <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
        <div className="h-px w-full max-w-[600px] bg-gradient-to-r from-transparent via-fd-primary/40 to-transparent" />
      </div>

      <div className="mx-auto max-w-3xl text-center">
        <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Modular by design
        </h2>
        <p className="mb-10 text-fd-muted-foreground">
          Pick what you need. Every package is independently versioned.
        </p>

        <div className="grid gap-3 text-left sm:grid-cols-2">
          {[
            {
              pkg: "@zaikit/core",
              desc: "Agent and tool primitives",
            },
            {
              pkg: "@zaikit/react",
              desc: "React hooks and providers",
            },
            {
              pkg: "@zaikit/memory-postgres",
              desc: "PostgreSQL persistence",
            },
            {
              pkg: "@zaikit/codegen-react",
              desc: "Type-safe tool rendering codegen",
            },
            {
              pkg: "@zaikit/sandbox",
              desc: "Dev UI for testing agents",
            },
            {
              pkg: "@zaikit/memory",
              desc: "Memory interface and in-memory adapter",
            },
          ].map(({ pkg, desc }) => (
            <div
              key={pkg}
              className="rounded-xl border border-fd-border/40 bg-fd-card/30 px-4 py-3"
            >
              <span className="block font-mono text-sm text-fd-primary">
                {pkg}
              </span>
              <span className="text-xs text-fd-muted-foreground">{desc}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── Final CTA ─── */
function FinalCTA() {
  return (
    <section className="relative px-4 py-32">
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
        <div className="h-[400px] w-[400px] rounded-full bg-[oklch(0.7_0.17_162/0.06)] blur-[100px]" />
      </div>

      <div className="relative z-10 mx-auto max-w-2xl text-center">
        <h2 className="mb-4 text-3xl font-bold tracking-tight sm:text-4xl">
          Ready to build?
        </h2>
        <p className="mb-8 text-lg text-fd-muted-foreground">
          ZAIKit is open source. Start building your first agent today.
        </p>
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/docs/getting-started"
            className="group inline-flex items-center gap-2 rounded-xl bg-fd-primary px-7 py-3.5 text-sm font-semibold text-fd-primary-foreground transition-all hover:brightness-110"
          >
            Read the Docs
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <a
            href="https://github.com/lioneltay/zaikit"
            className="inline-flex items-center gap-2 rounded-xl border border-fd-border px-7 py-3.5 text-sm font-semibold transition-colors hover:bg-fd-accent"
          >
            <GitHubIcon className="size-4" />
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}

/* ─── Page ─── */
export default function HomePage() {
  return (
    <>
      <Hero />
      <CodeShowcase />
      <Features />
      <Architecture />
      <Packages />
      <FinalCTA />
    </>
  );
}
