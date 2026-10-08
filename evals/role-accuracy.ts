import { loadScriptEnvironment } from "./load-env.ts";

loadScriptEnvironment();

const {
  allowedClassificationRoles,
  classifyFilesByPurpose,
  isAllowedClassificationRole,
} = await import("../lib/ai/classification-core.ts");
const { createEvalDatabaseClient } = await import("./database.ts");

const minimumDatasetSize = 30;
const requestedSize = readRequestedSize();
const database = createEvalDatabaseClient();
const { data: roleRows, error: roleError } = await database
  .from("file_roles")
  .select("analysis_id, file_id, role")
  .eq("source", "convention")
  .in("role", [...allowedClassificationRoles])
  .order("created_at", { ascending: false })
  .limit(500);
if (roleError) throw roleError;

const selectedRoles = roleRows.slice(0, requestedSize);

const { data: files, error: filesError } = await database
  .from("files")
  .select("id, path, content")
  .in("id", selectedRoles.map((row) => row.file_id))
  .limit(500);
if (filesError) throw filesError;

const filesById = new Map(files.map((file) => [file.id, file]));
const storedDataset = selectedRoles.flatMap((role) => {
  const file = filesById.get(role.file_id);
  return file
    ? [{
        evalPath: `${role.analysis_id}/${file.path}`,
        path: file.path,
        content: file.content,
        expectedRole: role.role,
      }]
    : [];
});
const localDataset = await loadLocalConventionFiles(
  requestedSize - storedDataset.length,
);
const dataset = [...storedDataset, ...localDataset];
if (dataset.length < minimumDatasetSize) {
  throw new Error(
    `Role accuracy requires at least ${minimumDatasetSize} readable conventional files; found ${storedDataset.length} stored and ${localDataset.length} local`,
  );
}

const predictions = await classifyFilesByPurpose(
  dataset.map((item) => ({ path: item.evalPath, content: item.content })),
);
const failures = dataset.filter(
  (item) => predictions.get(item.evalPath) !== item.expectedRole,
);
const correct = dataset.length - failures.length;

console.log(`Role accuracy: ${correct}/${dataset.length} (${percent(correct, dataset.length)})`);
for (const item of failures) {
  console.log(
    `${item.path}: expected ${item.expectedRole}, received ${predictions.get(item.evalPath) ?? "missing"}`,
  );
}

function readRequestedSize(): number {
  const argument = process.argv.find((value) => value.startsWith("--size="));
  const parsed = Number(argument?.slice("--size=".length) ?? 50);
  if (!Number.isInteger(parsed) || parsed < minimumDatasetSize || parsed > 200) {
    throw new Error("--size must be an integer from 30 to 200");
  }
  return parsed;
}

async function loadLocalConventionFiles(limit: number) {
  if (limit <= 0) return [];

  const { parseRepository } = await import("../parser/index.ts");
  const result = await parseRepository(process.cwd());
  const filesByPath = new Map(result.files.map((file) => [file.path, file]));

  return result.fileRoles.flatMap((fileRole) => {
    if (
      fileRole.source !== "convention" ||
      !isAllowedClassificationRole(fileRole.role)
    ) {
      return [];
    }
    const file = filesByPath.get(fileRole.filePath);
    return file
      ? [{
          evalPath: `local-worktree/${file.path}`,
          path: file.path,
          content: file.content,
          expectedRole: fileRole.role,
        }]
      : [];
  }).slice(0, limit);
}

function percent(numerator: number, denominator: number): string {
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}
