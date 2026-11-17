import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";
import { createLlm } from "./llm.js";
import { runFetch } from "./steps/fetch.js";
import { runSummarize } from "./steps/summarize.js";
import { finishRun, startRun, type RunStatus } from "./steps/runLog.js";

const STEPS = ["fetch", "summarize", "brief", "all"] as const;
type Step = (typeof STEPS)[number];

const USAGE = `AI Radar pipeline

Usage: npm run pipeline -- [options]

Options:
  --step <name>   fetch | summarize | brief | all   (default: all)
  --dry-run       run without writing to the database
  --force         regenerate today's brief even if it exists
  --limit <n>     max articles to summarize in this run (default: 100; dry run: 3)
  --check         verify config and database connection, then exit
  -h, --help      show this help
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      step: { type: "string", default: "all" },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
      limit: { type: "string" },
      check: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
    },
    strict: true,
  });

  if (values.help) {
    console.log(USAGE);
    return;
  }

  const step = values.step as Step;
  if (!STEPS.includes(step)) {
    throw new Error(`Unknown --step "${values.step}". Use one of: ${STEPS.join(", ")}`);
  }

  const config = loadConfig();
  const db = createDb(config);

  if (values.check) {
    const { count, error } = await db.from("sources").select("*", { count: "exact", head: true });
    if (error) throw new Error(`Database check failed: ${error.message}`);
    console.log(`OK: config valid, database reachable, ${count ?? 0} sources configured.`);
    return;
  }

  const dryRun = values["dry-run"];
  const runId = dryRun ? null : await startRun(db);
  const stats: Record<string, unknown> = {};
  let status: RunStatus = "success";

  try {
    if (step === "fetch" || step === "all") {
      const since = new Date(Date.now() - config.FETCH_WINDOW_HOURS * 3600_000);
      console.log(`Fetching articles published since ${since.toISOString()}${dryRun ? " (dry run)" : ""}`);
      const fetchResult = await runFetch(db, { since, dryRun });
      stats.fetch = fetchResult;
      if (fetchResult.failedSources > 0) status = "partial";
      console.log(`Fetch done: ${fetchResult.totalInserted} new articles, ${fetchResult.failedSources} failed sources.`);
    }
    if (step === "summarize" || step === "all") {
      const limit = values.limit ? Number(values.limit) : dryRun ? 3 : 100;
      if (!Number.isInteger(limit) || limit < 1) throw new Error("--limit must be a positive integer");
      const sum = await runSummarize(db, {
        llm: createLlm({ apiKey: config.OPENROUTER_API_KEY }),
        model: config.OPENROUTER_MODEL_SUMMARY,
        maxArticleChars: config.MAX_ARTICLE_CHARS,
        dryRun,
        limit,
      });
      stats.summarize = sum;
      if (sum.failed > 0) status = "partial";
      console.log(
        `Summarize done: ${sum.summarized}/${sum.pending} ok, ${sum.failed} failed, ` +
          `${sum.usage.tokensIn} in / ${sum.usage.tokensOut} out tokens, $${sum.usage.cost.toFixed(4)}`,
      );
    }
    if (step === "brief" || step === "all") console.log("Brief: not implemented yet (M5).");
  } catch (err) {
    if (runId) await finishRun(db, runId, "failed", stats, err instanceof Error ? err.message : String(err));
    throw err;
  }
  if (runId) await finishRun(db, runId, status, stats);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
