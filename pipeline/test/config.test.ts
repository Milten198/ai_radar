import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.js";

const valid = {
  OPENROUTER_API_KEY: "test-key",
  OPENROUTER_MODEL_SUMMARY: "google/gemini-2.5-flash",
  OPENROUTER_MODEL_BRIEF: "google/gemini-2.5-flash",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "test-secret",
};

describe("parseConfig", () => {
  it("accepts a complete config and applies defaults", () => {
    const config = parseConfig(valid);
    expect(config.FETCH_WINDOW_HOURS).toBe(48);
    expect(config.MAX_ARTICLE_CHARS).toBe(12000);
  });

  it("coerces numeric env strings", () => {
    expect(parseConfig({ ...valid, FETCH_WINDOW_HOURS: "24" }).FETCH_WINDOW_HOURS).toBe(24);
  });

  it("treats empty strings as missing and names every missing key", () => {
    expect(() => parseConfig({ ...valid, OPENROUTER_API_KEY: "", SUPABASE_URL: undefined })).toThrow(
      /OPENROUTER_API_KEY[\s\S]*SUPABASE_URL|SUPABASE_URL[\s\S]*OPENROUTER_API_KEY/,
    );
  });

  it("rejects a malformed Supabase URL", () => {
    expect(() => parseConfig({ ...valid, SUPABASE_URL: "not-a-url" })).toThrow(/SUPABASE_URL/);
  });
});
