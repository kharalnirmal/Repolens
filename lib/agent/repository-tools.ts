import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { loadAnalysisGraph } from "@/lib/analysis/load-analysis-graph";
import { walkDependencies } from "@/lib/graph/analysis";
import type { Database } from "@/lib/supabase/database.types";

const toolNames = [
  "summary",
  "search-files",
  "files-by-role",
  "neighbors",
  "walk",
  "routes",
] as const;

export type RepositoryToolName = (typeof toolNames)[number];

export function isRepositoryToolName(value: string): value is RepositoryToolName {
  return (toolNames as readonly string[]).includes(value);
}

export async function runRepositoryTool(
  supabase: SupabaseClient<Database>,
  analysisId: string,
  toolName: RepositoryToolName,
  input: unknown,
): Promise<unknown> {
  const analysis = await loadAnalysisGraph(supabase, analysisId);
  const files = analysis.graph.nodes
    .flatMap((node) => node.files)
    .toSorted((left, right) => left.path.localeCompare(right.path));
  const edges = analysis.graph.edges;

  switch (toolName) {
    case "summary":
      requireRecord(input);
      return {
        repositoryName: analysis.repositoryName,
        framework: analysis.framework,
        coverage: analysis.coverage,
        fileCount: files.length,
        edgeCount: edges.length,
        routeCount: analysis.routes.length,
        unidentifiedFileCount: analysis.unidentifiedFileCount,
        roles: analysis.categories.map(({ role, label, count }) => ({
          role,
          label,
          count,
        })),
        insights: analysis.insights,
      };
    case "search-files": {
      const record = requireRecord(input);
      const pathFragment = requireString(record.pathFragment, "pathFragment");
      const limit = readLimit(record.limit, 25);
      const normalizedFragment = pathFragment.toLocaleLowerCase("en-US");
      return files
        .filter((file) =>
          file.path.toLocaleLowerCase("en-US").includes(normalizedFragment),
        )
        .slice(0, limit);
    }
    case "files-by-role": {
      const record = requireRecord(input);
      const role = requireString(record.role, "role");
      const limit = readLimit(record.limit, 50);
      return files.filter((file) => file.role === role).slice(0, limit);
    }
    case "neighbors": {
      const record = requireRecord(input);
      const filePath = requireExistingPath(record.filePath, files);
      return {
        filePath,
        dependencies: edges
          .filter((edge) => edge.sourcePath === filePath)
          .map((edge) => ({ filePath: edge.targetPath, edge })),
        importers: edges
          .filter((edge) => edge.targetPath === filePath)
          .map((edge) => ({ filePath: edge.sourcePath, edge })),
      };
    }
    case "walk": {
      const record = requireRecord(input);
      const filePath = requireExistingPath(record.filePath, files);
      const direction = record.direction;
      if (direction !== "incoming" && direction !== "outgoing") {
        throw new ToolInputError("direction must be incoming or outgoing");
      }
      const depth = readDepth(record.depth);
      return {
        filePath,
        direction,
        depth,
        paths: walkDependencies(filePath, edges, direction, depth),
      };
    }
    case "routes":
      requireRecord(input);
      return analysis.routes;
  }
}

export class ToolInputError extends Error {}

function requireRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new ToolInputError("Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ToolInputError(`${name} must be a non-empty string`);
  }
  return value;
}

function requireExistingPath(
  value: unknown,
  files: readonly { path: string }[],
): string {
  const filePath = requireString(value, "filePath");
  if (!files.some((file) => file.path === filePath)) {
    throw new ToolInputError("filePath is not an analyzed file");
  }
  return filePath;
}

function readLimit(value: unknown, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 100) {
    throw new ToolInputError("limit must be an integer from 1 to 100");
  }
  return value as number;
}

function readDepth(value: unknown): number {
  if (value === undefined) return 2;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 10) {
    throw new ToolInputError("depth must be an integer from 1 to 10");
  }
  return value as number;
}
