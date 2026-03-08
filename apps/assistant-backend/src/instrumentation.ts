if (process.env.LANGFUSE_SECRET_KEY) {
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const { LangfuseSpanProcessor } = await import("@langfuse/otel");

  const sdk = new NodeSDK({
    spanProcessors: [new LangfuseSpanProcessor()],
  });

  sdk.start();

  const shutdown = () => sdk.shutdown();
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

export {};
