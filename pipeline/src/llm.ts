import type { z } from "zod";
import { sleep } from "./lib/http.js";

const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const RETRYABLE = new Set([408, 429, 500, 502, 503, 504]);

export interface Usage {
  tokensIn: number;
  tokensOut: number;
  /** USD, as reported by OpenRouter (0 if not reported). */
  cost: number;
}

export interface LlmClient {
  /** Chat completion that must return JSON matching `schema`. Retries transport errors and one invalid answer. */
  json<T>(args: { model: string; system: string; user: string; schema: z.ZodType<T>; maxTokens?: number }): Promise<{
    data: T;
    usage: Usage;
    model: string;
  }>;
}

export function addUsage(a: Usage, b: Usage): Usage {
  return { tokensIn: a.tokensIn + b.tokensIn, tokensOut: a.tokensOut + b.tokensOut, cost: a.cost + b.cost };
}
export const ZERO_USAGE: Usage = { tokensIn: 0, tokensOut: 0, cost: 0 };

/** Extract the JSON object from a model reply (tolerates ```json fences and leading prose). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced?.[1] ?? text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("no JSON object in reply");
  return JSON.parse(candidate.slice(start, end + 1));
}

interface ChatResponse {
  model?: string;
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
  error?: { message?: string; code?: number };
}

export function createLlm({
  apiKey,
  fetch: fetchFn = globalThis.fetch,
  retryDelayMs = 2000,
}: {
  apiKey: string;
  fetch?: typeof globalThis.fetch;
  retryDelayMs?: number;
}): LlmClient {
  async function call(body: unknown): Promise<ChatResponse> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= 3; attempt++) {
      if (attempt > 0) await sleep(retryDelayMs * 2 ** (attempt - 1));
      try {
        const res = await fetchFn(OPENROUTER_URL, {
          method: "POST",
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json", "X-Title": "AI Radar" },
          body: JSON.stringify(body),
          signal: AbortSignal.timeout(120_000),
        });
        const json = (await res.json().catch(() => ({}))) as ChatResponse;
        if (res.ok && !json.error) return json;
        lastError = new Error(`OpenRouter ${res.status}: ${json.error?.message ?? res.statusText}`);
        if (!RETRYABLE.has(res.status) && !(res.ok && json.error)) break;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError instanceof Error ? lastError : new Error(String(lastError));
  }

  return {
    async json({ model, system, user, schema, maxTokens = 2000 }) {
      let usage = ZERO_USAGE;
      let lastProblem = "";
      // Two attempts: if the first answer is not valid JSON for the schema, ask once more.
      for (let attempt = 0; attempt < 2; attempt++) {
        const messages = [
          { role: "system", content: system },
          { role: "user", content: user },
          ...(attempt > 0
            ? [{ role: "user", content: `Your previous reply was invalid (${lastProblem}). Reply with ONLY the JSON object.` }]
            : []),
        ];
        const res = await call({
          model,
          messages,
          response_format: { type: "json_object" },
          max_tokens: maxTokens,
          temperature: 0.2,
          usage: { include: true },
        });
        usage = addUsage(usage, {
          tokensIn: res.usage?.prompt_tokens ?? 0,
          tokensOut: res.usage?.completion_tokens ?? 0,
          cost: res.usage?.cost ?? 0,
        });
        const text = res.choices?.[0]?.message?.content ?? "";
        try {
          const parsed = schema.safeParse(extractJson(text));
          if (parsed.success) return { data: parsed.data, usage, model: res.model ?? model };
          lastProblem = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
        } catch (err) {
          lastProblem = err instanceof Error ? err.message : String(err);
        }
      }
      throw new Error(`LLM returned invalid output twice: ${lastProblem}`);
    },
  };
}
