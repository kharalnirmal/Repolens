import { spawn, spawnSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  readFileSync,
  watch,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const buildDirectory = join(root, ".mda", "build");
const reloadDirectory = join(root, ".mda", "reload");
const mdaEntrypoint = join(
  root,
  "node_modules",
  "managed-deepagents",
  "bin",
  "mda.mjs",
);
const npmEntrypoint = join(
  dirname(process.execPath),
  "node_modules",
  "npm",
  "bin",
  "npm-cli.js",
);
const devArguments = process.argv.slice(2);

if (!existsSync(npmEntrypoint)) {
  console.error("The Node.js installation must include npm.");
  process.exit(1);
}

function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function compile(output) {
  run(process.execPath, [mdaEntrypoint, "build", root, "--out", output]);
}

compile(buildDirectory);
run(process.execPath, [npmEntrypoint, "ci"], buildDirectory);

const envFile = join(root, ".env");
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

const portIndex = devArguments.findIndex((argument) => argument === "--port");
const inlinePort = devArguments.find((argument) => argument.startsWith("--port="));
const port = inlinePort?.slice("--port=".length) ??
  (portIndex >= 0 ? devArguments[portIndex + 1] : undefined) ??
  "2024";
process.env.MDA_PUBLIC_API_URL ??= `http://localhost:${port}`;
// Local-only: the managed runtime gates API-key auth behind MDA_LOCAL_DEV,
// which `mda dev` sets but this launcher bypasses. Deploy never sets it.
process.env.MDA_LOCAL_DEV ??= "1";

const buildEnvFile = join(buildDirectory, ".env");
const localEnv = existsSync(envFile) ? readFileSync(envFile, "utf8") : "";
const envSeparator = localEnv.length > 0 && !localEnv.endsWith("\n") ? "\n" : "";
writeFileSync(
  buildEnvFile,
  `${localEnv}${envSeparator}MDA_PUBLIC_API_URL=${process.env.MDA_PUBLIC_API_URL}\n`,
);

let installedLock = readFileSync(join(buildDirectory, "package-lock.json"), "utf8");
let rebuildTimer;
let rebuilding = false;
let rebuildPending = false;

function rebuild() {
  if (rebuilding) {
    rebuildPending = true;
    return;
  }

  rebuilding = true;
  try {
    compile(reloadDirectory);
    const nextLock = readFileSync(join(reloadDirectory, "package-lock.json"), "utf8");
    cpSync(reloadDirectory, buildDirectory, {
      recursive: true,
      force: true,
      filter: (source) => !source.endsWith(".mda-build"),
    });

    if (nextLock !== installedLock) {
      run(process.execPath, [npmEntrypoint, "ci"], buildDirectory);
      installedLock = nextLock;
    }

    console.log("MDA source rebuilt.");
  } finally {
    rebuilding = false;
    if (rebuildPending) {
      rebuildPending = false;
      rebuild();
    }
  }
}

const watcher = watch(root, { recursive: true }, (_event, filename) => {
  if (!filename) {
    return;
  }

  const path = relative(root, join(root, filename)).replaceAll("\\", "/");
  if (
    path === ".env" ||
    path.startsWith(".git/") ||
    path.startsWith(".mda/") ||
    path.startsWith("node_modules/")
  ) {
    return;
  }

  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(rebuild, 250);
});

const langGraphEntrypoint = join(
  buildDirectory,
  "node_modules",
  "@langchain",
  "langgraph-cli",
  "dist",
  "cli",
  "cli.mjs",
);
const server = spawn(
  process.execPath,
  [langGraphEntrypoint, "dev", ...devArguments],
  { cwd: buildDirectory, env: process.env, stdio: "inherit" },
);

server.on("error", (error) => {
  watcher.close();
  throw error;
});

server.on("exit", (code) => {
  watcher.close();
  process.exit(code ?? 1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}
