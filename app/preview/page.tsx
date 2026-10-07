import path from "node:path";

import analysis from "./analysis";
import { PreviewCanvas } from "./preview-canvas";

import { foldGraph } from "@/lib/graph/fold";

const categoryColors = [
  "var(--file-kind-1)",
  "var(--file-kind-2)",
  "var(--file-kind-3)",
  "var(--file-kind-4)",
  "var(--file-kind-5)",
  "var(--file-kind-6)",
];

export default function PreviewPage() {
  const graph = foldGraph(analysis.files, analysis.edges);
  const counts = new Map<string, number>();
  for (const file of analysis.files) {
    const extension = path.posix.extname(file.path).slice(1) || "other";
    counts.set(extension, (counts.get(extension) ?? 0) + 1);
  }
  const categories = [...counts.entries()]
    .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([extension, count], index) => ({
      extension,
      count,
      color: categoryColors[index % categoryColors.length],
    }));

  return (
    <PreviewCanvas
      framework={analysis.adapter.framework}
      repositoryName={analysis.repository.name}
      graph={graph}
      categories={categories}
      routeCount={0}
      unidentifiedFileCount={
        analysis.adapter.name === "fallback" ? analysis.files.length : 0
      }
    />
  );
}
