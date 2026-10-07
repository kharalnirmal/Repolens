import { promises as fs } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseRepository } from "./index.ts";

interface CliArguments {
  directory: string;
  outputPath?: string;
}

async function main(): Promise<void> {
  const arguments_ = parseArguments(process.argv.slice(2));
  const result = await parseRepository(arguments_.directory);
  const coverage = result.coverage;
  const folders = new Set(result.files.map((file) => file.folder));

  console.log(`Repository: ${result.repository.root}`);
  console.log(`Files found: ${coverage.filesFound}`);
  console.log(`Files parsed: ${coverage.filesParsed}`);
  console.log(`Files skipped: ${coverage.filesSkipped}`);
  console.log(`Distinct folders: ${folders.size}`);
  console.log(`Edges: ${result.edges.length}`);
  console.log(
    `Imports: ${coverage.importsFound} found, ${coverage.importsResolved} resolved, ${coverage.importsExternal} external, ${coverage.importsExcluded} excluded, ${coverage.importsUnresolved} unresolved`,
  );
  console.log(
    `Re-exports: ${coverage.reExportsFound} found, ${coverage.reExportsResolved} resolved`,
  );

  const nonResolvedReExports = coverage.imports.filter(
    (item) => item.kind === "re-export" && item.status !== "resolved",
  );
  if (nonResolvedReExports.length > 0) {
    console.log("Non-resolved re-exports:");
    for (const item of nonResolvedReExports) {
      console.log(
        `  ${item.sourcePath} -> ${item.specifier}: ${item.status}, ${item.reason ?? "no reason recorded"}`,
      );
    }
  }

  if (coverage.skippedFiles.length > 0) {
    console.log("Skipped files:");
    for (const skipped of coverage.skippedFiles) {
      console.log(`  ${skipped.path}: ${skipped.reason}`);
    }
  }

  const unresolved = coverage.imports.filter(
    (item) => item.status === "unresolved" || item.status === "excluded",
  );
  if (unresolved.length > 0) {
    console.log("Unresolved or excluded imports:");
    for (const item of unresolved) {
      console.log(
        `  ${item.sourcePath} -> ${item.specifier}: ${item.reason ?? item.status}`,
      );
    }
  }

  if (arguments_.outputPath) {
    const outputPath = path.resolve(arguments_.outputPath);
    await writeTypedOutput(outputPath, result);
    console.log(`Typed output: ${outputPath}`);
  }
}

function parseArguments(arguments_: string[]): CliArguments {
  let directory: string | undefined;
  let outputPath: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--output" || argument === "-o") {
      outputPath = arguments_[index + 1];
      if (!outputPath) throw new Error(`${argument} requires a file path`);
      index += 1;
    } else if (argument === "--help" || argument === "-h") {
      console.log("Usage: pnpm parse [directory] [--output result.ts]");
      process.exit(0);
    } else if (!directory) {
      directory = argument;
    } else {
      throw new Error(`Unexpected argument: ${argument}`);
    }
  }

  if (outputPath && path.extname(outputPath) !== ".ts") {
    throw new Error("Typed output path must end in .ts");
  }

  return { directory: path.resolve(directory ?? "."), outputPath };
}

async function writeTypedOutput(
  outputPath: string,
  result: Awaited<ReturnType<typeof parseRepository>>,
): Promise<void> {
  const typesPath = path.resolve(import.meta.dirname, "types");
  if (path.parse(outputPath).root !== path.parse(typesPath).root) {
    throw new Error(
      "Typed output must be written on the same drive as the parser source",
    );
  }

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  let relativeTypesPath = path.relative(path.dirname(outputPath), typesPath);
  relativeTypesPath = relativeTypesPath.split(path.sep).join("/");
  if (!relativeTypesPath.startsWith(".")) relativeTypesPath = `./${relativeTypesPath}`;

  const content = [
    `import type { RepositoryParseResult } from ${JSON.stringify(relativeTypesPath)};`,
    "",
    `const analysis = ${JSON.stringify(result, null, 2)} satisfies RepositoryParseResult;`,
    "",
    "export default analysis;",
    "",
  ].join("\n");

  await fs.writeFile(outputPath, content, "utf8");
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
