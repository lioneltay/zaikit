import { stepCountIs } from "ai";
import { z } from "zod";
import { createAgent, createTool, model } from "@lioneltay/aikit-core";
import { createPostgresMemory } from "@lioneltay/aikit-memory-postgres";

const memory = createPostgresMemory({
  connectionString: process.env.DATABASE_URL!,
});

await memory.initialize();

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

const confirm_action = createTool({
  description:
    "Request user confirmation before performing a sensitive action. Use this when the user asks you to do something potentially destructive or important.",
  inputSchema: z.object({
    action: z.string().describe("Description of the action to confirm"),
  }),
  suspendSchema: z.object({
    message: z.string(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
  }),
  execute: async ({ input, suspend, resumeData }) => {
    if (!resumeData) {
      return suspend({ message: `Please confirm: ${input.action}` });
    }
    if (!resumeData.approved) {
      return { status: "cancelled", message: "Action was denied by user" };
    }
    return { status: "confirmed", message: `Action confirmed: ${input.action}` };
  },
});

export const agent = createAgent({
  model,
  system:
    "You are a helpful assistant. When the user asks you to perform sensitive or destructive actions (like deleting records, modifying data, etc.), use the confirm_action tool to get their approval first.",
  tools: {
    get_weather,
    confirm_action,
  },
  memory,
  stopWhen: stepCountIs(5),
});
