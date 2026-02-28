import { createTool, createAgent, model } from "@lioneltay/aikit-core";
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
  execute: async ({ input, suspend, resumeData }) => {
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

export const agent = createAgent({
  model,
  tools: { greet, book_flight: bookFlight },
});
