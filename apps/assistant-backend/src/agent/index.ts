import { tool, stepCountIs } from "ai";
import { z } from "zod";
import { createAgent, model } from "@lioneltay/aikit-core";
import { createPostgresMemory } from "@lioneltay/aikit-memory-postgres";

const memory = createPostgresMemory({
  connectionString: process.env.DATABASE_URL!,
});

await memory.initialize();

export const agent = createAgent({
  model,
  system: "You are a helpful assistant.",
  tools: {
    get_weather: tool({
      description: "Get the current weather for a location",
      inputSchema: z.object({
        location: z.string().describe("City name, e.g. 'Sydney'"),
      }),
      execute: async ({ location }) => {
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
          location,
          temperature: Math.round(Math.random() * 35 + 5),
          condition:
            conditions[Math.floor(Math.random() * conditions.length)],
          humidity: Math.round(Math.random() * 60 + 30),
          windSpeed: Math.round(Math.random() * 30 + 5),
        };
      },
    }),
  },
  memory,
  stopWhen: stepCountIs(5),
});
