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
  execute: async ({ input }) => {
    const conditions = [
      "Sunny",
      "Cloudy",
      "Rainy",
      "Stormy",
      "Snowy",
      "Windy",
      "Partly Cloudy",
    ];
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
  execute: async ({ input, suspend, resumeData }) => {
    const flights = generateFlights(input.destination, input.date);

    if (!resumeData) {
      return suspend({ flights });
    }

    const flight = flights.find((f) => f.id === resumeData.selectedFlightId);
    if (!flight) {
      return { error: `Flight ${resumeData.selectedFlightId} not found` };
    }

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

// -- Context-aware tools --

const get_my_profile = createTool({
  description: "Get the current user's profile information.",
  inputSchema: z.object({}),
  context: z.object({
    userId: z.string(),
    orgId: z.string(),
    orgName: z.string(),
  }),
  execute: async ({ context }) => {
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
  model,
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
- get_my_profile: Look up the current user's profile (name, department, role).
- get_recent_activity: Show the user's recent activity log.

Be concise and helpful. For actions that have consequences (booking, sending, submitting), always use the appropriate tool so the user can review and confirm.`,
  tools: {
    get_weather,
    submit_expense,
    book_flight,
    send_email,
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
