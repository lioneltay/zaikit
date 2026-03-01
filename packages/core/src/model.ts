import { createVertex } from "@ai-sdk/google-vertex";
import type { LanguageModel } from "ai";

export const vertex = createVertex({
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION,
});

export const model: LanguageModel = vertex("gemini-3-flash-preview");
export const fastModel: LanguageModel = vertex("gemini-3-flash-preview");
export const proModel: LanguageModel = vertex("gemini-3.1-pro-preview");
