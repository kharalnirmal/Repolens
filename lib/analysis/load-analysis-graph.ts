import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateInsights } from "@/lib/graph/analysis";
import { foldGraph } from "@/lib/graph/fold";
import { taxonomyFor } from "@/lib/framework/taxonomy";
import type { Database, Json } from "@/lib/supabase/database.types";
import type { DependencyEdge, ImportKind, ModuleKind } from "@/parser/types";

const categoryColors = [
  "var(--file-kind-1)",
  "var(--file-kind-2)",
  "var(--file-kind-3)",
  "var(--file-kind-4)",
  "var(--file-kind-5)",
  "var(--file-kind-6)",
];

const conventionEntryRoles = new Set([
  "api",
  "bootstrap",
  "config",
  "controller",
  "entry",
  "layout",
  "middleware",
  "page",
  "route",
]);

export async function loadAnalysisGraph(
  supabase: SupabaseClient<Database>,
  analysisId: string,
) {
  const { data, error } = await supabase.rpc("get_analysis_graph", {
    p_analysis_id: analysisId,
  });
  if (error) throw new Error(`Could not load analysis graph: ${error.message}`);
  if (!data) throw new Error("Completed analysis has no stored graph");

  const graphData = readObject(data, "analysis graph");
  const repositoryName = readString(graphData.repository_name, "repository name");
  const framework = readNullableString(graphData.framework, "framework");
  const coverageData = readObject(graphData.coverage, "coverage");
  const coverage = {
    filesFound: readNumber(coverageData.filesFound, "files found"),
    filesParsed: readNumber(coverageData.filesParsed, "files parsed"),
    filesSkipped: readNumber(coverageData.filesSkipped, "files skipped"),
    importsFound: readNumber(coverageData.importsFound, "imports found"),
    importsResolved: readNumber(coverageData.importsResolved, "imports resolved"),
    importsExternal: readNumber(coverageData.importsExternal, "external imports"),
    importsExcluded: readNumber(coverageData.importsExcluded, "excluded imports"),
    importsUnresolved: readNumber(coverageData.importsUnresolved, "unresolved imports"),
    reExportsFound: readNumber(coverageData.reExportsFound, "re-exports found"),
    reExportsResolved: readNumber(coverageData.reExportsResolved, "re-exports resolved"),
  };
  const storedFiles = readArray(graphData.files, "files").map((value) => {
    const file = readObject(value, "file");
    return {
      path: readString(file.path, "file path"),
      lineCount: readNumber(file.line_count, "line count"),
      moduleKind: readModuleKind(file.module_kind),
      role: readString(file.role, "file role"),
      roleSource: readRoleSource(file.role_source),
    };
  });
  const edges: DependencyEdge[] = readArray(graphData.edges, "edges").map((value) => {
    const edge = readObject(value, "edge");
    return {
      sourcePath: readString(edge.source_path, "edge source"),
      targetPath: readString(edge.target_path, "edge target"),
      kind: readImportKind(edge.kind),
      specifier: readString(edge.specifier, "edge specifier"),
    };
  });

  const fanIn = new Map(storedFiles.map((file) => [file.path, 0]));
  const fanOut = new Map(storedFiles.map((file) => [file.path, 0]));
  for (const edge of edges) {
    fanOut.set(edge.sourcePath, (fanOut.get(edge.sourcePath) ?? 0) + 1);
    fanIn.set(edge.targetPath, (fanIn.get(edge.targetPath) ?? 0) + 1);
  }

  const files = storedFiles.map((file) => ({
    ...file,
    folder: path.posix.dirname(file.path),
    fanIn: fanIn.get(file.path) ?? 0,
    fanOut: fanOut.get(file.path) ?? 0,
  }));
  const conventionEntryPaths = new Set(
    files
      .filter((file) => conventionEntryRoles.has(file.role))
      .map((file) => file.path),
  );
  const counts = new Map<string, number>();
  for (const file of files) {
    counts.set(file.role, (counts.get(file.role) ?? 0) + 1);
  }
  const categories = taxonomyFor(framework).map((category, index) => ({
    role: category.role,
    label: category.label,
    count: counts.get(category.role) ?? 0,
    color: categoryColors[index % categoryColors.length],
  }));
  const knownRoles = new Set(categories.map((category) => category.role));
  for (const [role, count] of counts) {
    if (knownRoles.has(role)) continue;
    categories.push({
      role,
      label: role,
      count,
      color: categoryColors[categories.length % categoryColors.length],
    });
  }
  const routes = readArray(graphData.routes, "routes").map((value) => {
    const route = readObject(value, "route");
    return {
      filePath: readString(route.file_path, "route file path"),
      method: readString(route.method, "route method"),
      path: readString(route.path, "route path"),
    };
  });

  return {
    repositoryName,
    framework,
    coverage,
    graph: foldGraph(files, edges),
    insights: calculateInsights(files, edges, conventionEntryPaths),
    categories,
    routes,
    unidentifiedFileCount: files.filter((file) => file.roleSource === "fallback").length,
  };
}

function readObject(
  value: Json | undefined,
  name: string,
): Record<string, Json | undefined> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Stored ${name} is invalid`);
  }
  return value;
}

function readArray(value: Json | undefined, name: string): Json[] {
  if (!Array.isArray(value)) throw new Error(`Stored ${name} are invalid`);
  return value;
}

function readString(value: Json | undefined, name: string): string {
  if (typeof value !== "string") throw new Error(`Stored ${name} is invalid`);
  return value;
}

function readNullableString(value: Json | undefined, name: string): string | null {
  if (value === null) return null;
  return readString(value, name);
}

function readNumber(value: Json | undefined, name: string): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`Stored ${name} is invalid`);
  }
  return value;
}

function readModuleKind(value: Json | undefined): ModuleKind {
  if (value === "esm" || value === "commonjs" || value === "script") return value;
  throw new Error("Stored module kind is invalid");
}

function readImportKind(value: Json | undefined): ImportKind {
  if (
    value === "import" ||
    value === "re-export" ||
    value === "dynamic-import" ||
    value === "require"
  ) {
    return value;
  }
  throw new Error("Stored import kind is invalid");
}

function readRoleSource(value: Json | undefined): "convention" | "model" | "fallback" {
  if (value === "convention" || value === "model" || value === "fallback") return value;
  throw new Error("Stored file role source is invalid");
}
