import OpenAI from "openai";
import { wrapOpenAI } from "langsmith/wrappers";

export const explanationModel = "gemini-3.5-flash-lite";
export const classificationModel = "gemini-3.5-flash-lite";

export const tracingConfigured =
  process.env.LANGSMITH_TRACING === "true" &&
  Boolean(process.env.LANGSMITH_API_KEY?.trim());

function createAIClient() {
  if (!process.env.GEMINI_API_KEY?.trim()) {
    throw new Error("Missing required environment variable: GEMINI_API_KEY");
  }

  return wrapOpenAI(
    new OpenAI({
      apiKey: process.env.GEMINI_API_KEY,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    }),
  );
}

let client: ReturnType<typeof createAIClient> | undefined;

export function getAIClient() {
  client ??= createAIClient();
  return client;
}
