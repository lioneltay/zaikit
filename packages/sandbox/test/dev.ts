import { createAgent, createTool, model } from "@zaikit/core";
import { createInMemoryMemory } from "@zaikit/memory-inmemory";
import { z } from "zod";
import { createSandbox } from "../src/index";

const memory = createInMemoryMemory();

const get_weather = createTool({
  description: "Get the current weather for a location",
  inputSchema: z.object({
    location: z.string().describe("City name, e.g. 'Sydney'"),
  }),
  execute: async ({ input }) => {
    const conditions = ["Sunny", "Cloudy", "Rainy", "Stormy", "Windy"];
    return {
      location: input.location,
      temperature: Math.round(Math.random() * 35 + 5),
      condition: conditions[Math.floor(Math.random() * conditions.length)],
    };
  },
});

const approve_action = createTool({
  description: "Request user approval before performing a destructive action",
  inputSchema: z.object({
    action: z.string().describe("The action to approve"),
  }),
  suspendSchema: z.object({
    message: z.string(),
  }),
  resumeSchema: z.object({
    approved: z.boolean(),
  }),
  execute: async ({ input, suspend, resumeData }) => {
    if (!resumeData) {
      return suspend({ message: `Approve: ${input.action}?` });
    }
    return {
      approved: resumeData.approved,
      action: input.action,
    };
  },
});

const weatherAgent = createAgent({
  model,
  system:
    "You are a helpful weather assistant. Use the get_weather tool to check weather.",
  tools: { get_weather, approve_action },
  memory,
});

const chatAgent = createAgent({
  model,
  system: "You are a friendly chat assistant. Answer questions helpfully.",
  tools: {},
  memory: createInMemoryMemory(),
});

const sandbox = createSandbox({
  agents: {
    weather: weatherAgent,
    chat: chatAgent,
  },
});

sandbox.listen(4000);
