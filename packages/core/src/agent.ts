import {
  streamText,
  convertToModelMessages,
  type LanguageModel,
  type StreamTextResult,
} from "ai";

type CreateAgentOptions = {
  model: LanguageModel;
  system?: string;
};

export function createAgent({ model, system }: CreateAgentOptions) {
  return {
    async stream(
      messages: Parameters<typeof convertToModelMessages>[0]
    ): Promise<StreamTextResult<Record<string, never>, never>> {
      return streamText({
        model,
        system,
        messages: await convertToModelMessages(messages),
      });
    },
  };
}
