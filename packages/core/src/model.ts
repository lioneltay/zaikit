import { type LanguageModel } from "ai";
import { createVertex } from "@ai-sdk/google-vertex";

const vertex = createVertex({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION,
});

export const model: LanguageModel = vertex("gemini-2.5-flash");
export const fastModel: LanguageModel = vertex("gemini-2.5-flash");
export const proModel: LanguageModel = vertex("gemini-2.5-pro");
