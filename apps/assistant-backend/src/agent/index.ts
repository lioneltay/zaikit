import { createAgent, createTool, model } from "@zaikit/core";
import { stripHtml } from "@zaikit/core/middleware";
import { createPostgresMemory } from "@zaikit/memory-postgres";
import { z } from "zod";

const memory = createPostgresMemory({
  connectionString: process.env.DATABASE_URL ?? "",
});

await memory.initialize();

// ---------------------------------------------------------------------------
// Mock data — replace with real APIs / DB queries for production use
// ---------------------------------------------------------------------------

const employees: Record<
  string,
  {
    name: string;
    email: string;
    department: string;
    role: string;
    joinDate: string;
  }
> = {
  "user-123": {
    name: "Alice Chen",
    email: "alice.chen@acmecorp.com",
    department: "Engineering",
    role: "Senior Software Engineer",
    joinDate: "2023-04-15",
  },
};

const activityLog = [
  { action: "commented", target: "PR #482 — Add caching layer" },
  { action: "merged", target: "PR #479 — Fix auth redirect" },
  { action: "created", target: "Issue #501 — Investigate memory leak" },
  { action: "reviewed", target: "PR #477 — Update onboarding flow" },
  { action: "deployed", target: "v2.14.1 to staging" },
  { action: "edited", target: "Wiki — API rate-limit guidelines" },
];

// ---------------------------------------------------------------------------
// Tools
// ---------------------------------------------------------------------------

const get_weather = createTool({
  description:
    "Get the current weather for a location. Useful for checking conditions at a travel destination.",
  inputSchema: z.object({
    location: z.string().describe("City name, e.g. 'Sydney'"),
  }),
  execute: async ({ input, writeMetadata }) => {
    const conditions = [
      "Sunny",
      "Cloudy",
      "Rainy",
      "Stormy",
      "Snowy",
      "Windy",
      "Partly Cloudy",
    ];

    writeMetadata({
      suggestions: [
        `Book a flight to ${input.location}`,
        "Check tomorrow's forecast",
      ],
    });

    return {
      location: input.location,
      temperature: Math.round(Math.random() * 35 + 5),
      condition: conditions[Math.floor(Math.random() * conditions.length)],
      humidity: Math.round(Math.random() * 60 + 30),
      windSpeed: Math.round(Math.random() * 30 + 5),
    };
  },
});

const submit_expense = createTool({
  description:
    "Submit an expense claim for manager approval. Requires user confirmation before submitting.",
  inputSchema: z.object({
    description: z.string().describe("What the expense is for"),
    amount: z.number().describe("Amount in USD"),
    category: z
      .enum(["travel", "meals", "equipment", "software", "other"])
      .describe("Expense category"),
  }),
  suspendSchema: z.object({
    message: z.string(),
    summary: z.object({
      description: z.string(),
      amount: z.number(),
      category: z.string(),
    }),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
  }),
  execute: async ({ input, suspend, resumeData }) => {
    if (!resumeData) {
      return suspend({
        message: `Submit expense claim for $${input.amount.toFixed(2)}?`,
        summary: {
          description: input.description,
          amount: input.amount,
          category: input.category,
        },
      });
    }

    if (!resumeData.approved) {
      return { submitted: false, reason: "User cancelled" };
    }

    const claimId = `EXP-${Date.now().toString(36).toUpperCase()}`;
    return {
      submitted: true,
      claimId,
      description: input.description,
      amount: input.amount,
      category: input.category,
      status: "pending_approval",
    };
  },
});

const generateFlights = (_destination: string, date: string) => [
  {
    id: "QF42",
    airline: "Qantas",
    price: 1249,
    departure: `${date} 08:30`,
  },
  {
    id: "SQ21",
    airline: "Singapore Airlines",
    price: 1089,
    departure: `${date} 11:15`,
  },
  {
    id: "EK404",
    airline: "Emirates",
    price: 1375,
    departure: `${date} 14:50`,
  },
  {
    id: "CX100",
    airline: "Cathay Pacific",
    price: 998,
    departure: `${date} 19:20`,
  },
];

const book_flight = createTool({
  description:
    "Search for flights to a destination and let the user pick one to book.",
  inputSchema: z.object({
    destination: z.string().describe("Destination city"),
    date: z.string().describe("Travel date, e.g. '2025-03-15'"),
  }),
  suspendSchema: z.object({
    flights: z.array(
      z.object({
        id: z.string(),
        airline: z.string(),
        price: z.number(),
        departure: z.string(),
      }),
    ),
  }),
  resumeSchema: z.object({
    selectedFlightId: z.string(),
    seatPreference: z.enum(["window", "aisle", "middle"]),
  }),
  execute: async ({ input, suspend, resumeData, writeMetadata }) => {
    const flights = generateFlights(input.destination, input.date);

    if (!resumeData) {
      return suspend({ flights });
    }

    const flight = flights.find((f) => f.id === resumeData.selectedFlightId);
    if (!flight) {
      return { error: `Flight ${resumeData.selectedFlightId} not found` };
    }

    writeMetadata({
      suggestions: [
        `Submit a travel expense for $${flight.price}`,
        `Check weather in ${input.destination}`,
      ],
    });

    return {
      confirmation: `Booked ${flight.airline} flight ${flight.id} to ${input.destination}`,
      status: "booked",
      flight,
      seat: resumeData.seatPreference,
    };
  },
});

const send_email = createTool({
  description:
    "Send an email. Shows a preview for the user to review and optionally edit before sending.",
  inputSchema: z.object({
    to: z.string().describe("Recipient email address"),
    subject: z.string().describe("Email subject line"),
    body: z.string().describe("Email body text"),
  }),
  suspendSchema: z.object({
    preview: z.object({
      to: z.string(),
      subject: z.string(),
      body: z.string(),
    }),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
    to: z.string().optional(),
    subject: z.string().optional(),
    body: z.string().optional(),
  }),
  execute: async ({ input, suspend, resumeData }) => {
    if (!resumeData) {
      return suspend({
        preview: { to: input.to, subject: input.subject, body: input.body },
      });
    }

    if (!resumeData.approved) {
      return { sent: false, reason: "User cancelled" };
    }

    const finalTo = resumeData.to ?? input.to;
    const finalSubject = resumeData.subject ?? input.subject;
    const finalBody = resumeData.body ?? input.body;

    console.log(
      `[Email Sent] To: ${finalTo} | Subject: ${finalSubject} | Body: ${finalBody}`,
    );

    return {
      sent: true,
      to: finalTo,
      subject: finalSubject,
      body: finalBody,
    };
  },
});

// -- Deploy tool (writeToolData + suspend/resume demo) --

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

type DeployStep = {
  step: string;
  detail: string;
  status: "running" | "done";
}[];

async function runStepsWithProgress(
  items: { name: string; detail: string }[],
  writeToolData: (
    type: "deploy-progress",
    data: DeployStep,
    opts?: { id?: string },
  ) => void,
  id: string,
) {
  const steps: DeployStep = [];
  const emit = () => writeToolData("deploy-progress", [...steps], { id });

  for (const item of items) {
    steps.push({ step: item.name, detail: item.detail, status: "running" });
    emit();
    await delay(800 + Math.random() * 400);
    steps[steps.length - 1].status = "done";
    emit();
  }
}

const deploy_service = createTool({
  description:
    "Deploy a service to a target environment. Runs pre-deploy checks, asks for confirmation, deploys, then asks to activate traffic.",
  inputSchema: z.object({
    service: z.string().describe("Service name, e.g. 'auth-service'"),
    environment: z
      .enum(["staging", "production"])
      .describe("Target environment"),
  }),
  dataSchema: {
    "deploy-progress": z.array(
      z.object({
        step: z.string(),
        detail: z.string(),
        status: z.enum(["running", "done"]),
      }),
    ),
  },
  suspendSchema: z.object({
    phase: z.enum(["confirm-deploy", "activate-traffic"]),
    service: z.string(),
    environment: z.string(),
    version: z.string(),
    checksCompleted: z.number().optional(),
    deployUrl: z.string().optional(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
  }),
  execute: async ({ input, writeToolData, suspend, resumeHistory }) => {
    // Derive a stable version from the input so it stays consistent across
    // re-executions (the tool runs from scratch on each resume).
    const hash = Array.from(input.service + input.environment).reduce(
      (h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0,
      0,
    );
    const version = `v${(Math.abs(hash) % 5) + 1}.${Math.abs(hash >> 5) % 20}.${Math.abs(hash >> 10) % 10}`;

    // Phase 0: Initial call — run pre-deploy checks, then ask for confirmation
    if (resumeHistory.length === 0) {
      await runStepsWithProgress(
        [
          { name: "Linting", detail: "eslint + prettier" },
          { name: "Unit tests", detail: "247 tests" },
          { name: "Build", detail: `${input.service}:${version}` },
        ],
        writeToolData,
        "pre-deploy",
      );

      return suspend({
        phase: "confirm-deploy",
        service: input.service,
        environment: input.environment,
        version,
        checksCompleted: 3,
      });
    }

    // Phase 1: User responded to deploy confirmation
    if (resumeHistory.length === 1) {
      if (!resumeHistory[0].approved) {
        return { deployed: false, reason: "User cancelled deploy" };
      }

      await runStepsWithProgress(
        [
          {
            name: "Pushing image",
            detail: `registry.acme.io/${input.service}:${version}`,
          },
          { name: "Rolling out pods", detail: `${input.environment} cluster` },
          { name: "Health check", detail: "GET /healthz" },
        ],
        writeToolData,
        "deploy",
      );

      const url = `https://${input.service}.${input.environment}.acme.io`;
      return suspend({
        phase: "activate-traffic",
        service: input.service,
        environment: input.environment,
        version,
        deployUrl: url,
      });
    }

    // Phase 2: User responded to traffic activation
    const lastResume = resumeHistory[resumeHistory.length - 1];
    if (!lastResume.approved) {
      return {
        deployed: true,
        trafficActive: false,
        reason:
          "Deployed but traffic not activated — still on previous version",
        service: input.service,
        environment: input.environment,
        version,
        url: `https://${input.service}.${input.environment}.acme.io`,
      };
    }

    const url = `https://${input.service}.${input.environment}.acme.io`;
    await runStepsWithProgress(
      [
        { name: "Shifting traffic", detail: `0% → 100% to ${version}` },
        { name: "DNS propagation", detail: url },
        { name: "Smoke tests", detail: "12 scenarios passed" },
      ],
      writeToolData,
      "traffic",
    );

    return {
      deployed: true,
      trafficActive: true,
      service: input.service,
      environment: input.environment,
      version,
      url,
    };
  },
});

// -- Context-aware tools --

const get_my_profile = createTool({
  description: "Get the current user's profile information.",
  inputSchema: z.object({}),
  context: z.object({
    userId: z.string(),
    orgId: z.string(),
    orgName: z.string(),
  }),
  execute: async ({ context, writeMetadata }) => {
    writeMetadata({ dataClassification: "pii" });

    const employee = employees[context.userId];
    if (!employee) {
      return {
        userId: context.userId,
        orgName: context.orgName,
        name: "Unknown User",
        department: "Unknown",
        role: "Unknown",
      };
    }
    return {
      userId: context.userId,
      orgName: context.orgName,
      ...employee,
    };
  },
});

const get_recent_activity = createTool({
  description: "Get the current user's recent activity.",
  inputSchema: z.object({
    limit: z.number().optional().describe("Max items to return (default 5)"),
  }),
  context: z.object({ userId: z.string() }),
  execute: async ({ input, context }) => {
    const limit = input.limit ?? 5;
    return {
      userId: context.userId,
      activities: activityLog.slice(0, limit).map((entry, i) => ({
        id: `act-${i + 1}`,
        ...entry,
        timestamp: new Date(Date.now() - i * 3600_000).toISOString(),
      })),
    };
  },
});

// ---------------------------------------------------------------------------
// Agent
// ---------------------------------------------------------------------------

export const agent = createAgent({
  name: "acme-assistant",
  model,
  telemetry: true,
  context: z.object({
    userId: z.string(),
    orgId: z.string(),
    orgName: z.string(),
  }),
  middleware: [
    stripHtml({
      transform: (html) => `...html redacted (${html.length})...`,
      ignoreCodeBlocks: true,
    }),
  ],
  system: (ctx) =>
    `You are a workplace assistant for ${ctx.orgName}. You help employees with travel planning, expenses, communications, and day-to-day tasks.

Available tools:
- get_weather: Check weather at a location — useful for travel planning.
- book_flight: Search and book flights. Shows available options for the user to pick from.
- submit_expense: Submit an expense claim. Shows a summary for user confirmation before submitting.
- send_email: Draft and send emails. Shows a preview the user can edit before sending.
- deploy_service: Deploy a service to staging or production. Runs checks, asks for confirmation, then deploys.
- get_my_profile: Look up the current user's profile (name, department, role).
- get_recent_activity: Show the user's recent activity log.

Be concise and helpful. For actions that have consequences (booking, sending, submitting), always use the appropriate tool so the user can review and confirm.`,
  tools: {
    get_weather,
    submit_expense,
    book_flight,
    send_email,
    deploy_service,
    get_my_profile,
    get_recent_activity: {
      tool: get_recent_activity,
      mapContext: (agentCtx) => ({ userId: agentCtx.userId }),
    },
  },
  memory,
  onAfterStep: ({ steps }) => {
    if (steps.length >= 5) {
      throw new Error("Max steps (5) reached");
    }
  },
});
