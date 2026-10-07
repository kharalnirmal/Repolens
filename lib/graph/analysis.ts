import type { DependencyEdge } from "@/parser/types";

export type WalkDirection = "incoming" | "outgoing";

export interface GraphFile {
  path: string;
  lineCount: number;
}

export interface GraphInsights {
  unimported: string[];
  unusualFanIn: string[];
  cycles: string[][];
  oversized: string[];
}

export const insightSentences = {
  unimported: "Nothing in the repository imports these files.",
  unusualFanIn: "An unusual number of files import these files.",
  cycles: "These files form an import cycle.",
  oversized: "These files are more than 500 lines long.",
} as const;

const oversizedLineCount = 500;
const minimumUnusualFanIn = 10;

/**
 * Return sorted, unique paths reachable within the depth limit, excluding the start.
 * Incoming walks follow importers; outgoing walks follow dependencies. The default
 * depth is two edges, and depths below one return no paths.
 */
export function walkDependencies(
  startPath: string,
  edges: readonly DependencyEdge[],
  direction: WalkDirection,
  depth = 2,
): string[] {
  if (depth < 1) return [];

  const adjacency = new Map<string, Set<string>>();
  for (const edge of edges) {
    const from = direction === "outgoing" ? edge.sourcePath : edge.targetPath;
    const to = direction === "outgoing" ? edge.targetPath : edge.sourcePath;
    const targets = adjacency.get(from) ?? new Set<string>();
    targets.add(to);
    adjacency.set(from, targets);
  }

  const visited = new Set([startPath]);
  let frontier = [startPath];

  for (let level = 0; level < depth && frontier.length > 0; level += 1) {
    const next: string[] = [];
    for (const path of frontier) {
      for (const target of adjacency.get(path) ?? []) {
        if (visited.has(target)) continue;
        visited.add(target);
        next.push(target);
      }
    }
    frontier = next;
  }

  visited.delete(startPath);
  return [...visited].toSorted();
}

/**
 * Derive deterministic insights, excluding conventional entries from unimported files.
 * Unusual fan-in starts at the greater of ten importers and the 95th percentile;
 * oversized files exceed 500 lines. Results use stable path tie-breakers.
 */
export function calculateInsights(
  files: readonly GraphFile[],
  edges: readonly DependencyEdge[],
  conventionEntryPaths: ReadonlySet<string> = new Set(),
): GraphInsights {
  const importersByPath = new Map(
    files.map((file) => [file.path, new Set<string>()]),
  );
  for (const edge of edges) {
    importersByPath.get(edge.targetPath)?.add(edge.sourcePath);
  }
  const fanIns = files
    .map((file) => importersByPath.get(file.path)?.size ?? 0)
    .toSorted((left, right) => left - right);
  const percentileIndex = Math.max(0, Math.ceil(fanIns.length * 0.95) - 1);
  const unusualFanInThreshold = Math.max(
    minimumUnusualFanIn,
    fanIns[percentileIndex] ?? minimumUnusualFanIn,
  );

  return {
    unimported: files
      .filter(
        (file) =>
          importersByPath.get(file.path)?.size === 0 &&
          !conventionEntryPaths.has(file.path),
      )
      .map((file) => file.path)
      .toSorted(),
    unusualFanIn: files
      .filter(
        (file) =>
          (importersByPath.get(file.path)?.size ?? 0) >= unusualFanInThreshold,
      )
      .toSorted(
        (left, right) =>
          (importersByPath.get(right.path)?.size ?? 0) -
            (importersByPath.get(left.path)?.size ?? 0) ||
          left.path.localeCompare(right.path),
      )
      .map((file) => file.path),
    cycles: findImportCycles(files.map((file) => file.path), edges),
    oversized: files
      .filter((file) => file.lineCount > oversizedLineCount)
      .toSorted((left, right) => right.lineCount - left.lineCount || left.path.localeCompare(right.path))
      .map((file) => file.path),
  };
}

/**
 * Find deterministic cycle witnesses using iterative depth-first traversal.
 * Each witness repeats its first path at the end to show the closing edge.
 * This does not enumerate every overlapping simple cycle.
 */
export function findImportCycles(
  filePaths: readonly string[],
  edges: readonly DependencyEdge[],
): string[][] {
  const adjacency = new Map(filePaths.map((filePath) => [filePath, new Set<string>()]));
  for (const edge of edges) adjacency.get(edge.sourcePath)?.add(edge.targetPath);

  const state = new Map<string, 0 | 1 | 2>();
  const cycles = new Map<string, string[]>();

  for (const start of filePaths.toSorted()) {
    if ((state.get(start) ?? 0) !== 0) continue;

    const stack: Array<{ path: string; targets: string[]; nextIndex: number }> = [
      { path: start, targets: [...(adjacency.get(start) ?? [])].toSorted(), nextIndex: 0 },
    ];
    const pathIndexes = new Map([[start, 0]]);
    state.set(start, 1);

    while (stack.length > 0) {
      const frame = stack.at(-1)!;
      const target = frame.targets[frame.nextIndex];

      if (target === undefined) {
        state.set(frame.path, 2);
        pathIndexes.delete(frame.path);
        stack.pop();
        continue;
      }

      frame.nextIndex += 1;
      const targetState = state.get(target) ?? 0;
      if (targetState === 0) {
        pathIndexes.set(target, stack.length);
        state.set(target, 1);
        stack.push({
          path: target,
          targets: [...(adjacency.get(target) ?? [])].toSorted(),
          nextIndex: 0,
        });
        continue;
      }

      if (targetState === 1) {
        const cycleStart = pathIndexes.get(target);
        if (cycleStart === undefined) continue;
        const cycle = [...stack.slice(cycleStart).map((item) => item.path), target];
        cycles.set(canonicalCycleKey(cycle), cycle);
      }
    }
  }

  return [...cycles.values()].toSorted((left, right) =>
    canonicalCycleKey(left).localeCompare(canonicalCycleKey(right)),
  );
}

/** Create a rotation-independent key for a closed cycle while preserving edge direction. */
function canonicalCycleKey(cycle: readonly string[]): string {
  const nodes = cycle.slice(0, -1);
  if (nodes.length === 0) return "";
  return nodes
    .map((_, index) => [...nodes.slice(index), ...nodes.slice(0, index)].join("\u0000"))
    .toSorted()[0];
}
