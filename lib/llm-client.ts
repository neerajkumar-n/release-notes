import OpenAI from 'openai';

const FALLBACK_MODEL = 'glm-latest';

/**
 * Creates an OpenAI client with LiteLLM configuration
 */
export function createOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.AI_API_KEY || '',
    baseURL: process.env.AI_BASE_URL || 'https://grid.ai.juspay.net',
  });
}

/**
 * Gets the primary model ID from environment or falls back to glm-latest
 */
export function getModelId(fallback: string = FALLBACK_MODEL): string {
  return process.env.AI_MODEL_ID || fallback;
}

/**
 * Determines if an error is retriable (should trigger fallback to glm-latest)
 */
function isRetriableError(error: any): boolean {
  // Retry on rate limits, server errors, and model availability issues
  return (
    error?.status === 429 || // Rate limit
    error?.status >= 500 || // Server errors
    error?.code === 'model_not_found' ||
    error?.code === 'invalid_model_error' ||
    error?.code === 'service_unavailable' ||
    error?.type === 'rate_limit_error' ||
    error?.type === 'server_error'
  );
}

/**
 * Makes a chat completion request with automatic fallback to glm-latest
 * @param params - Chat completion parameters
 * @returns The completion response
 * @throws Error if both primary and fallback attempts fail
 */
export async function chatCompletionWithFallback(
  params: OpenAI.ChatCompletionCreateParamsNonStreaming,
  options?: { fallbackModel?: string }
): Promise<OpenAI.Chat.Completions.ChatCompletion> {
  const client = createOpenAIClient();
  const primaryModel = params.model;
  const fallbackModel = options?.fallbackModel || FALLBACK_MODEL;

  // If primary model is already the fallback, just make the request
  if (primaryModel === fallbackModel) {
    return await client.chat.completions.create(params);
  }

  try {
    console.log(`[LLM] Using primary model: ${primaryModel}`);
    return await client.chat.completions.create(params);
  } catch (error: any) {
    console.error(`[LLM] Primary model ${primaryModel} failed:`, error.message || error);

    if (isRetriableError(error)) {
      console.log(`[LLM] Falling back to ${fallbackModel}`);
      try {
        return await client.chat.completions.create({
          ...params,
          model: fallbackModel,
        });
      } catch (fallbackError: any) {
        console.error(`[LLM] Fallback model ${fallbackModel} also failed:`, fallbackError.message || fallbackError);
        throw fallbackError;
      }
    }

    // If error is not retriable, throw the original error
    throw error;
  }
}