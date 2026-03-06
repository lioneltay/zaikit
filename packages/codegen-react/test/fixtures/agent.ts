import { createAgent, createTool, model } from "@zaikit/core";
import { z } from "zod";

const greet = createTool({
  description: "Greet a user",
  inputSchema: z.object({
    name: z.string(),
  }),
  execute: async ({ input }) => {
    return { message: `Hello, ${input.name}!` };
  },
});

const bookFlight = createTool({
  description: "Book a flight",
  inputSchema: z.object({
    from: z.string(),
    to: z.string(),
    date: z.string(),
  }),
  suspendSchema: z.object({
    flightOptions: z.array(
      z.object({
        airline: z.string(),
        price: z.number(),
      }),
    ),
  }),
  resumeSchema: z.object({
    selectedIndex: z.number(),
    notes: z.string().optional(),
  }),
  execute: async ({ suspend, resumeData }) => {
    if (resumeData) {
      return { confirmation: `Booked flight ${resumeData.selectedIndex}` };
    }
    return suspend({
      flightOptions: [
        { airline: "Airline A", price: 100 },
        { airline: "Airline B", price: 200 },
      ],
    });
  },
});

const deploy = createTool({
  description: "Deploy a service",
  inputSchema: z.object({
    service: z.string(),
  }),
  dataSchema: {
    "deploy-progress": z.array(
      z.object({
        step: z.string(),
        status: z.enum(["running", "done"]),
      }),
    ),
    preview: z.object({ html: z.string() }),
  },
  execute: async ({ writeToolData }) => {
    writeToolData("deploy-progress", [{ step: "Build", status: "running" }]);
    writeToolData("preview", { html: "<p>ok</p>" });
    return { ok: true };
  },
});

export const agent = createAgent({
  model,
  tools: { greet, book_flight: bookFlight, deploy },
});
