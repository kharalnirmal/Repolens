import path from "node:path";

import type { DependencyEdge, ParsedFile } from "@/parser/types";

export type CanvasFile = Pick<
  ParsedFile,
  "path" | "folder" | "lineCount" | "moduleKind" | "fanIn" | "fanOut"
>;

export interface FoldedNode {
  id: string;
  label: string;
  files: CanvasFile[];
  fanIn: number;
  fanOut: number;
}

export interface FoldedGraph {
  threshold: number;
  nodes: FoldedNode[];
  edges: DependencyEdge[];
  fileToNode: Record<string, string>;
}

interface DirectoryGroup {
  id: string;
  files: CanvasFile[];
}

const targetNodeCount = 24;

/**
 * Fold directory groups into at most 24 canvas nodes while retaining file-level edges.
 * Raise the merge threshold as needed and count imports between resulting groups.
 * @throws If an edge endpoint is missing from the supplied files.
 */
export function foldGraph(
  files: readonly ParsedFile[],
  edges: readonly DependencyEdge[],
): FoldedGraph {
  const canvasFiles = files.map(toCanvasFile);
  let threshold = 2;
  let groups = foldAtThreshold(canvasFiles, threshold);

  while (groups.length > targetNodeCount) {
    const nextGroupSize = Math.min(
      ...groups
        .filter((group) => group.id !== ".")
        .map((group) => group.files.length),
    );
    threshold = nextGroupSize + 1;
    groups = foldAtThreshold(canvasFiles, threshold);
  }

  const fileToNode: Record<string, string> = {};
  for (const group of groups) {
    for (const file of group.files) fileToNode[file.path] = group.id;
  }

  const fanCounts = new Map(
    groups.map((group) => [group.id, { fanIn: 0, fanOut: 0 }]),
  );

  for (const edge of edges) {
    const sourceId = fileToNode[edge.sourcePath];
    const targetId = fileToNode[edge.targetPath];
    if (!sourceId || !targetId) {
      throw new Error(
        `Folded graph is missing an edge endpoint: ${edge.sourcePath} -> ${edge.targetPath}`,
      );
    }
    if (sourceId === targetId) continue;
    fanCounts.get(sourceId)!.fanOut += 1;
    fanCounts.get(targetId)!.fanIn += 1;
  }

  const labels = shortestUniqueLabels(groups.map((group) => group.id));
  const nodes = groups.map((group) => ({
    id: group.id,
    label: labels.get(group.id) ?? group.id,
    files: group.files,
    fanIn: fanCounts.get(group.id)!.fanIn,
    fanOut: fanCounts.get(group.id)!.fanOut,
  }));

  return { threshold, nodes, edges: [...edges], fileToNode };
}

function foldAtThreshold(
  files: readonly CanvasFile[],
  threshold: number,
): DirectoryGroup[] {
  const groups = createDirectoryGroups(files);
  const maxDepth = Math.max(...[...groups.keys()].map(directoryDepth));

  for (let depth = maxDepth; depth > 0; depth -= 1) {
    // Decide the whole depth before applying merges so siblings cannot affect it.
    const merges = [...groups.values()]
      .filter(
        (group) =>
          directoryDepth(group.id) === depth && group.files.length < threshold,
      )
      .map((group) => ({ childId: group.id, parentId: parentDirectory(group.id) }));

    for (const { childId, parentId } of merges) {
      const child = groups.get(childId);
      const parent = groups.get(parentId);
      if (!child || !parent) continue;
      parent.files.push(...child.files);
      groups.delete(childId);
    }
  }

  return [...groups.values()]
    .filter((group) => group.files.length > 0)
    .map((group) => ({
      ...group,
      files: group.files.toSorted((left, right) =>
        left.path.localeCompare(right.path),
      ),
    }))
    .toSorted((left, right) => left.id.localeCompare(right.id));
}

function createDirectoryGroups(
  files: readonly CanvasFile[],
): Map<string, DirectoryGroup> {
  const groups = new Map<string, DirectoryGroup>([[".", { id: ".", files: [] }]]);

  for (const file of files) {
    let directory = file.folder;
    while (true) {
      if (!groups.has(directory)) groups.set(directory, { id: directory, files: [] });
      if (directory === ".") break;
      directory = parentDirectory(directory);
    }
    groups.get(file.folder)!.files.push(file);
  }

  return groups;
}

function shortestUniqueLabels(ids: readonly string[]): Map<string, string> {
  const labels = new Map<string, string>();

  for (const id of ids) {
    if (id === ".") {
      labels.set(id, "root");
      continue;
    }

    const segments = id.split("/");
    for (let length = 1; length <= segments.length; length += 1) {
      const candidate = segments.slice(-length).join("/");
      const unique = ids.every(
        (otherId) =>
          otherId === id ||
          !otherId.split("/").slice(-length).join("/").endsWith(candidate),
      );
      if (unique || length === segments.length) {
        labels.set(id, candidate);
        break;
      }
    }
  }

  return labels;
}

function toCanvasFile(file: ParsedFile): CanvasFile {
  return {
    path: file.path,
    folder: file.folder,
    lineCount: file.lineCount,
    moduleKind: file.moduleKind,
    fanIn: file.fanIn,
    fanOut: file.fanOut,
  };
}

function parentDirectory(directory: string): string {
  const parent = path.posix.dirname(directory);
  return parent === "" ? "." : parent;
}

function directoryDepth(directory: string): number {
  return directory === "." ? 0 : directory.split("/").length;
}
