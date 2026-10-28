import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { Categories, Extraction } from "../types";
import { AiError, type AiProvider, CLAUDE_MODEL, sanitizeExtraction, systemPrompt } from "./provider";
import { ExtractionSchema } from "./schema";

/**
 * Claude called straight from the browser with the user's own API key.
 * The key lives only in this browser's localStorage and goes only to api.anthropic.com.
 */
export class ClaudeProvider implements AiProvider {
  readonly name = "Claude";
  private client: Anthropic;

  constructor(apiKey: string) {
    // The SDK refuses to run in a browser unless told to, because a key in page code is usually a leak.
    // Here the key is the end user's own, typed in by them, so this is the intended setup.
    this.client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true, maxRetries: 2 });
  }

  async extract(input: { date: string; title: string; text: string }, categories: Categories): Promise<Extraction> {
    try {
      const response = await this.client.messages.parse({
        model: CLAUDE_MODEL,
        max_tokens: 8000,
        // Same system text on every call, so it is cached after the first entry of a Refresh.
        system: [{ type: "text", text: systemPrompt(categories), cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: `Entry date: ${input.date}\nTitle: ${input.title}\n\n<entry>\n${input.text}\n</entry>`,
          },
        ],
        output_config: { effort: "low", format: zodOutputFormat(ExtractionSchema) },
      });
      if (response.stop_reason === "refusal") throw new AiError("Claude declined to read this entry.", false);
      if (response.stop_reason === "max_tokens") throw new AiError("Claude's answer was cut off.", true);
      if (!response.parsed_output) throw new AiError("Claude returned data in an unexpected shape.", true);
      return sanitizeExtraction(response.parsed_output, categories);
    } catch (err) {
      throw toAiError(err);
    }
  }
}

function toAiError(err: unknown): AiError {
  if (err instanceof AiError) return err;
  if (err instanceof Anthropic.AuthenticationError) return new AiError("Claude rejected the API key. Check it in Settings.", false);
  if (err instanceof Anthropic.PermissionDeniedError) return new AiError("This API key isn't allowed to use Claude Haiku.", false);
  if (err instanceof Anthropic.RateLimitError) return new AiError("Claude rate limit hit. The rest will run on the next Refresh.", true);
  if (err instanceof Anthropic.BadRequestError) return new AiError(`Claude rejected the request: ${err.message}`, false);
  if (err instanceof Anthropic.APIConnectionError) return new AiError("Couldn't reach Claude. Check your connection.", true);
  if (err instanceof Anthropic.APIError) return new AiError(`Claude error: ${err.message}`, true);
  return new AiError(err instanceof Error ? err.message : String(err), true);
}
