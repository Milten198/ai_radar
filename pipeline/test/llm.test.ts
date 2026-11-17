import { describe, expect, it } from "vitest";
import { z } from "zod";
import { createLlm, extractJson } from "../src/llm.js";

const Schema = z.object({ answer: z.number() });

/** Fake OpenRouter: returns the queued responses in order and records request bodies. */
function fakeOpenRouter(replies: Array<{ status?: number; content?: string; error?: string }>) {
  const bodies: any[] = [];
  const fn = (async (_url: unknown, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body)));
    const r = replies.shift() ?? { status: 500 };
    const payload = r.error
      ? { error: { message: r.error } }
      : { model: "test/model", choices: [{ message: { content: r.content } }], usage: { prompt_tokens: 100, completion_tokens: 10, cost: 0.001 } };
    return new Response(JSON.stringify(payload), { status: r.status ?? 200 });
  }) as typeof fetch;
  return { fn, bodies };
}

const ask = (fn: typeof fetch) =>
  createLlm({ apiKey: "k", fetch: fn, retryDelayMs: 0 }).json({ model: "m", system: "s", user: "u", schema: Schema });

describe("extractJson", () => {
  it("parses plain, fenced, and prose-wrapped JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
    expect(extractJson('```json\n{"a":2}\n```')).toEqual({ a: 2 });
    expect(extractJson('Sure! Here it is: {"a":3} Hope this helps.')).toEqual({ a: 3 });
  });

  it("throws when there is no object", () => {
    expect(() => extractJson("no json here")).toThrow(/no JSON/);
  });
});

describe("llm.json", () => {
  it("returns validated data, usage and model; asks for JSON mode", async () => {
    const { fn, bodies } = fakeOpenRouter([{ content: '{"answer":42}' }]);
    const res = await ask(fn);
    expect(res).toEqual({ data: { answer: 42 }, model: "test/model", usage: { tokensIn: 100, tokensOut: 10, cost: 0.001 } });
    expect(bodies[0].response_format).toEqual({ type: "json_object" });
    expect(bodies[0].messages.map((m: any) => m.role)).toEqual(["system", "user"]);
  });

  it("re-asks once when the reply fails the schema, and sums usage of both calls", async () => {
    const { fn, bodies } = fakeOpenRouter([{ content: '{"answer":"x"}' }, { content: '{"answer":7}' }]);
    const res = await ask(fn);
    expect(res.data.answer).toBe(7);
    expect(res.usage.tokensIn).toBe(200);
    expect(bodies[1].messages.at(-1).content).toMatch(/previous reply was invalid/);
  });

  it("gives up after two invalid replies", async () => {
    const { fn } = fakeOpenRouter([{ content: "nope" }, { content: "still nope" }]);
    await expect(ask(fn)).rejects.toThrow(/invalid output twice/);
  });

  it("retries 429 / 5xx transport errors", async () => {
    const { fn } = fakeOpenRouter([{ status: 429, error: "rate limited" }, { status: 502, error: "bad gw" }, { content: '{"answer":1}' }]);
    expect((await ask(fn)).data.answer).toBe(1);
  });

  it("does not retry a 401", async () => {
    const { fn, bodies } = fakeOpenRouter([{ status: 401, error: "bad key" }]);
    await expect(ask(fn)).rejects.toThrow(/OpenRouter 401: bad key/);
    expect(bodies).toHaveLength(1);
  });
});
