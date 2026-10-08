import { loadScriptEnvironment } from "./load-env.ts";

loadScriptEnvironment();

const { Client } = await import("langsmith");
const { evaluateInventedPaths } = await import("../lib/evals/invented-paths.ts");

const textIndex = process.argv.indexOf("--text");
if (textIndex !== -1) {
  const explanation = process.argv[textIndex + 1];
  const pathsIndex = process.argv.indexOf("--paths");
  const paths = pathsIndex === -1
    ? []
    : (process.argv[pathsIndex + 1] ?? "").split(",").filter(Boolean);
  if (!explanation) throw new Error("--text requires an explanation");
  console.log(JSON.stringify(evaluateInventedPaths(explanation, paths), null, 2));
  process.exitCode = evaluateInventedPaths(explanation, paths).score === 1 ? 0 : 1;
} else {
  const projectName = process.env.LANGSMITH_PROJECT;
  if (!projectName?.trim()) {
    throw new Error("Missing required environment variable: LANGSMITH_PROJECT");
  }

  const client = new Client();
  const rows: Array<{
    score: number;
    inventedPaths: string[];
    pathTokenCount: number;
    appPath?: string;
  }> = [];
  for await (const run of client.listRuns({
    projectName,
    filter: 'eq(name, "invented-path-check")',
    error: false,
    order: "desc",
    limit: 100,
  })) {
    const output = readPathOutput(run.outputs);
    if (output) rows.push({ ...output, appPath: run.app_path });
  }

  if (rows.length === 0) {
    throw new Error("No live invented-path checks were found in the LangSmith project");
  }

  const passed = rows.filter((row) => row.score === 1).length;
  console.log(`Invented-path score: ${passed}/${rows.length} (${percent(passed, rows.length)})`);
  for (const row of rows.filter((item) => item.score === 0)) {
    console.log(`${row.inventedPaths.join(", ")} ${row.appPath ?? ""}`.trim());
  }
}

function readPathOutput(value: unknown): {
  score: number;
  inventedPaths: string[];
  pathTokenCount: number;
} | null {
  if (!value || typeof value !== "object") return null;
  if (!("score" in value) || !("inventedPaths" in value) || !("pathTokenCount" in value)) {
    return null;
  }
  if (
    typeof value.score !== "number" ||
    !Array.isArray(value.inventedPaths) ||
    !value.inventedPaths.every((path) => typeof path === "string") ||
    typeof value.pathTokenCount !== "number"
  ) {
    return null;
  }
  return {
    score: value.score,
    inventedPaths: value.inventedPaths,
    pathTokenCount: value.pathTokenCount,
  };
}

function percent(numerator: number, denominator: number): string {
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}
