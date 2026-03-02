import { createAgent, createTool, model } from "@zaikit/core";
import { stripHtml } from "@zaikit/core/middleware";
import { createPostgresMemory } from "@zaikit/memory-postgres";
import { z } from "zod";

const memory = createPostgresMemory({
  connectionString: process.env.DATABASE_URL ?? "",
});

await memory.initialize();

const mockDatabase = new Map([
  ["users", 1284],
  ["orders", 5621],
  ["logs", 89432],
  ["sessions", 3847],
]);

const get_weather = createTool({
  description: "Get the current weather for a location",
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

const delete_records = createTool({
  description:
    "Delete records from a database table. Requires user approval before proceeding.",
  inputSchema: z.object({
    table: z.string().describe("Table name to delete records from"),
    count: z.number().describe("Number of records to delete"),
  }),
  suspendSchema: z.object({
    message: z.string(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
  }),
  execute: async ({ input, suspend, resumeData }) => {
    const current = mockDatabase.get(input.table);
    if (current === undefined) {
      return {
        error: `Table "${input.table}" not found. Available tables: ${[...mockDatabase.keys()].join(", ")}`,
      };
    }

    if (!resumeData) {
      return suspend({
        message: `Delete ${input.count} records from "${input.table}" (${current} total)?`,
      });
    }

    if (!resumeData.approved) {
      return { deleted: 0, reason: "User declined" };
    }

    const toDelete = Math.min(input.count, current);
    mockDatabase.set(input.table, current - toDelete);
    return { deleted: toDelete, remaining: current - toDelete };
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

export const agent = createAgent({
  model,
  middleware: [
    stripHtml({
      transform: (html) => `...html redacted (${html.length})...`,
      ignoreCodeBlocks: true,
    }),
  ],
  system: `You are a helpful assistant with the following tools:

- get_weather: Get current weather for a city.
- delete_records: Delete records from a database table. Always use this tool when the user asks to delete data — it will ask for their approval.
- book_flight: Search for and book flights. Use when the user wants to travel somewhere — it will show available flights for them to choose from.
- send_email: Send an email. Use when the user asks you to email someone — it shows a preview they can edit before sending.

Use the appropriate tool for each request. For destructive or important actions, always use the tool so the user can confirm.`,
  tools: {
    get_weather,
    delete_records,
    book_flight,
    send_email,
  },
  memory,
  onAfterStep: ({ steps }) => {
    if (steps.length >= 5) {
      throw new Error("Max steps (5) reached");
    }
  },
});
