import { parseArgs } from "node:util";
import { loadConfig } from "./config.js";
import { createDb } from "./db.js";

const STEPS = ["fetch", "summarize", "brief", "all"] as const;
type Step = (typeof STEPS)[number];

const USAGE = `AI Radar pipeline

Usage: npm run pipeline -- [options]

Options:
  --step <name>   fetch | summarize | brief | all   (default: all)
  --dry-run       run without writing to the database
  --force         regenerate today's brief even if it exists
  --check         verify config and database connection, then exit
  -h, --help      show this help
`;

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      step: { type: "string", default: "all" },
      "dry-run": { type: "boolean", default: false },
      force: { type: "boolean", default: false },
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

  // Steps are implemented in M3 (fetch), M4 (summarize), M5 (brief).
  console.log(`Step "${step}" is not implemented yet.${values["dry-run"] ? " (dry run)" : ""}`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
