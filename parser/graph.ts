import type { DependencyEdge, ParsedFile } from "./types.ts";

export function calculateFanCounts(
  files: readonly ParsedFile[],
  edges: readonly DependencyEdge[],
): Map<string, { fanIn: number; fanOut: number }> {
  const counts = new Map(
    files.map((file) => [file.path, { fanIn: 0, fanOut: 0 }]),
  );

  for (const edge of edges) {
    const source = counts.get(edge.sourcePath);
    const target = counts.get(edge.targetPath);

    if (!source || !target) {
      throw new Error(
        `Cannot calculate fan counts for edge with missing file: ${edge.sourcePath} -> ${edge.targetPath}`,
      );
    }

    source.fanOut += 1;
    target.fanIn += 1;
  }

  return counts;
}
