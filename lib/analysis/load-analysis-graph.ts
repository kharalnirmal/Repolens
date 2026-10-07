import path from "node:path";

import type { SupabaseClient } from "@supabase/supabase-js";

import { calculateInsights } from "@/lib/graph/analysis";
import { foldGraph } from "@/lib/graph/fold";
import type { Database, Json } from "@/lib/supabase/database.types";
import { fallbackAdapter } from "@/parser/adapter";
import type { DependencyEdge, ImportKind, ModuleKind } from "@/parser/types";

const categoryColors = [
  "var(--file-kind-1)",
  "var(--file-kind-2)",
  "var(--file-kind-3)",
  "var(--file-kind-4)",
  "var(--file-kind-5)",
  "var(--file-kind-6)",
];

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
  const storedFiles = readArray(graphData.files, "files").map((value) => {
    const file = readObject(value, "file");
    return {
      path: readString(file.path, "file path"),
      lineCount: readNumber(file.line_count, "line count"),
      moduleKind: readModuleKind(file.module_kind),
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
      .filter((file) => fallbackAdapter.isConventionEntry(file.path))
      .map((file) => file.path),
  );
  const counts = new Map<string, number>();
  for (const file of files) {
    const extension = path.posix.extname(file.path).slice(1) || "other";
    counts.set(extension, (counts.get(extension) ?? 0) + 1);
  }

  return {
    repositoryName,
    framework,
    graph: foldGraph(files, edges),
    insights: calculateInsights(files, edges, conventionEntryPaths),
    categories: [...counts.entries()]
      .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
      .map(([extension, count], index) => ({
        extension,
        count,
        color: categoryColors[index % categoryColors.length],
      })),
    routeCount: readNumber(graphData.route_count, "route count"),
    unidentifiedFileCount: framework === null ? files.length : 0,
  };
}

function readObject(value: Json, name: string): Record<string, Json | undefined> {
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
  if (value === "import" || value === "re-export" || value === "dynamic-import") {
    return value;
  }
  throw new Error("Stored import kind is invalid");
}
