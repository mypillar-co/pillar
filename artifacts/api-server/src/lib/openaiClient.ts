import OpenAI from "openai";

export const AI_UNAVAILABLE_MESSAGE =
  "AI service unavailable. Check AI API configuration or billing.";

export function getOpenAIConfig() {
  const apiKey =
    process.env.OPENAI_API_KEY ??
    process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??
    process.env.AI_INTEGRATIONS_OPENAI_KEY;
  const baseURL =
    process.env.OPENAI_BASE_URL ??
    process.env.AI_INTEGRATIONS_OPENAI_BASE_URL ??
    "https://api.openai.com/v1";

  if (!apiKey) {
    throw new Error(AI_UNAVAILABLE_MESSAGE);
  }

  return { apiKey, baseURL };
}

export function hasOpenAIConfig() {
  return Boolean(
    process.env.OPENAI_API_KEY ??
      process.env.AI_INTEGRATIONS_OPENAI_API_KEY ??
      process.env.AI_INTEGRATIONS_OPENAI_KEY,
  );
}

export function createOpenAIClient(options: { timeout?: number } = {}) {
  const config = getOpenAIConfig();
  return new OpenAI({
    ...config,
    ...options,
  });
}
