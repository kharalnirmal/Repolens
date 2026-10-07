"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { Graph, layout } from "@dagrejs/dagre";
import { useEffect, useState } from "react";

import { ThemeControl } from "@/components/theme-control";
import {
  insightSentences,
  walkDependencies,
  type GraphInsights,
  type WalkDirection,
} from "@/lib/graph/analysis";
import type { CanvasFile, FoldedGraph, FoldedNode } from "@/lib/graph/fold";

interface Category {
  extension: string;
  count: number;
  color: string;
}

interface PreviewCanvasProps {
  repositoryName: string;
  framework: string | null;
  graph: FoldedGraph;
  insights: GraphInsights;
  categories: Category[];
  routeCount: number;
  unidentifiedFileCount: number;
}

type Selection =
  | { kind: "node"; id: string }
  | { kind: "file"; path: string }
  | null;

type DetailTab = "structure" | "explanation";

interface ModuleNodeData extends Record<string, unknown> {
  folderNode: FoldedNode;
  expanded: boolean;
  dimmed: boolean;
  selectedFile: string | null;
  hoveredFile: string | null;
  activeCategory: string | null;
  fileTypeColors: Record<string, string>;
  onClose: (id: string) => void;
  onHoverFile: (path: string | null) => void;
  onHoverNode: (id: string | null) => void;
  onSelectFile: (path: string) => void;
}

interface DependencyEdgeData extends Record<string, unknown> {
  sourcePaths: string[];
  targetPaths: string[];
}

type ModuleFlowNode = Node<ModuleNodeData, "module">;
type DependencyFlowEdge = Edge<DependencyEdgeData>;
type EdgeDirection = "incoming" | "outgoing" | "both";
type WalkResult = { direction: WalkDirection; paths: string[] } | null;

const maxVisibleRows = 8;
const moduleNodeTypes = { module: ModuleNode };

export function PreviewCanvas(props: PreviewCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

function Canvas({
  repositoryName,
  framework,
  graph,
  insights,
  categories,
  routeCount,
  unidentifiedFileCount,
}: PreviewCanvasProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [selection, setSelection] = useState<Selection>(null);
  const [hovered, setHovered] = useState<Exclude<Selection, null> | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("structure");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [refitVersion, setRefitVersion] = useState(0);
  const { fitView, getZoom } = useReactFlow<ModuleFlowNode, DependencyFlowEdge>();

  const closeNode = (id: string): void => {
    setExpandedIds((current) => {
      const next = new Set(current);
      next.delete(id);
      return next;
    });
    setSelection((current) =>
      current?.kind === "file" && graph.fileToNode[current.path] === id
        ? { kind: "node", id }
        : current,
    );
  };

  const selectFile = (filePath: string): void => {
    const nodeId = graph.fileToNode[filePath];
    if (!expandedIds.has(nodeId)) {
      setExpandedIds((current) => new Set(current).add(nodeId));
      setRefitVersion((version) => version + 1);
    }
    setSelection({ kind: "file", path: filePath });
  };

  const visualEdges = createVisualEdges(graph, expandedIds);
  const active = getActiveElements(graph, visualEdges, hovered ?? selection);
  const fileTypeColors = Object.fromEntries(
    categories.map((category) => [category.extension, category.color]),
  );
  const dimensions = new Map(
    graph.nodes.map((node) => [node.id, nodeDimensions(node, expandedIds.has(node.id))]),
  );
  const positions = layoutNodes(graph.nodes, visualEdges, dimensions);

  const nodes: ModuleFlowNode[] = graph.nodes.map((folderNode) => {
    const expanded = expandedIds.has(folderNode.id);
    const size = dimensions.get(folderNode.id)!;
    return {
      id: folderNode.id,
      type: "module",
      position: positions.get(folderNode.id)!,
      data: {
        folderNode,
        expanded,
        dimmed:
          activeCategory !== null
            ? !folderNode.files.some(
                (file) => fileExtension(file.path) === activeCategory,
              )
            : (selection !== null || hovered !== null) &&
              !active.nodeIds.has(folderNode.id),
        selectedFile:
          selection?.kind === "file" ? selection.path : null,
        hoveredFile: hovered?.kind === "file" ? hovered.path : null,
        activeCategory,
        fileTypeColors,
        onClose: closeNode,
        onHoverFile: (path) =>
          setHovered(path === null ? null : { kind: "file", path }),
        onHoverNode: (id) =>
          setHovered(id === null ? null : { kind: "node", id }),
        onSelectFile: selectFile,
      },
      style: { width: size.width, height: size.height },
      draggable: false,
      selectable: true,
      selected: selection?.kind === "node" && selection.id === folderNode.id,
      ariaLabel: `${folderNode.label}, ${folderNode.files.length} files, ${folderNode.fanIn} incoming and ${folderNode.fanOut} outgoing dependencies`,
    };
  });

  const edges: DependencyFlowEdge[] = visualEdges.map((edge) => {
    const direction = active.edgeDirections.get(edge.id);
    const stroke =
      direction === "incoming"
        ? "var(--incoming)"
        : direction === "outgoing"
          ? "var(--outgoing)"
          : direction === "both"
            ? "var(--accent)"
            : "var(--muted)";

    return {
      ...edge,
      type: "smoothstep",
      animated: false,
      selectable: false,
      style: {
        stroke,
        strokeWidth: active.edgeIds.has(edge.id) ? 1.5 : 1,
        opacity:
          activeCategory !== null
            ? edgeMatchesCategory(edge, activeCategory)
              ? 0.32
              : 0.04
            : selection === null && hovered === null
              ? 0.32
              : active.edgeIds.has(edge.id)
                ? 0.9
                : 0.06,
      },
    };
  });

  useEffect(() => {
    if (refitVersion === 0) return;
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.12, maxZoom: getZoom(), duration: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [fitView, getZoom, refitVersion]);

  return (
    <div className="flex h-dvh min-h-96 flex-col overflow-hidden bg-background text-foreground">
      <header className="flex h-11 shrink-0 items-center border-b border-border bg-surface px-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-6 shrink-0 place-items-center border border-foreground bg-foreground font-mono text-[8px] font-bold tracking-[-0.08em] text-surface">
            RL
          </div>
          <span className="text-xs font-semibold tracking-[-0.03em]">
            RepoLens
          </span>
          <span className="h-4 w-px bg-border" />
          <span className="truncate font-mono text-[10px] text-muted">
            {repositoryName}
          </span>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <div className="hidden items-center gap-3 font-mono text-[9px] text-muted sm:flex">
            <span>{graph.nodes.length} modules</span>
            <span>{Object.keys(graph.fileToNode).length} files</span>
            <span>fold {graph.threshold}</span>
          </div>
          <ThemeControl />
        </div>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-[3rem_minmax(18rem,1fr)_18rem] overflow-x-auto md:grid-cols-[11rem_minmax(18rem,1fr)_18rem]">
        <aside
          aria-label="File categories"
          className="min-h-0 border-r border-border bg-surface"
        >
          <div className="flex h-9 items-center justify-center border-b border-border px-3 md:justify-start">
            <span className="text-[9px] font-semibold text-muted">
              <span className="md:hidden">F</span>
              <span className="hidden md:inline">File types</span>
            </span>
          </div>
          <div className="hidden py-1.5 md:block">
            {categories.map((category) => (
              <button
                aria-pressed={activeCategory === category.extension}
                className={`grid w-full grid-cols-[8px_1fr_auto] items-center gap-2 border-l-2 px-2.5 py-1.5 text-left text-[10px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                  activeCategory === category.extension
                    ? "border-l-accent bg-surface-muted font-semibold text-foreground"
                    : activeCategory === null
                      ? "border-l-transparent hover:bg-surface-muted"
                      : "border-l-transparent text-muted hover:bg-surface-muted hover:text-foreground"
                }`}
                key={category.extension}
                onClick={() =>
                  setActiveCategory((current) =>
                    current === category.extension ? null : category.extension,
                  )
                }
                type="button"
              >
                <span
                  className="size-2"
                  style={{ backgroundColor: category.color }}
                />
                <span>{category.extension}</span>
                <span className="tabular-nums text-muted">{category.count}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col items-center gap-2 py-3 md:hidden">
            {categories.map((category) => (
              <button
                aria-label={`${category.extension}: ${category.count} files`}
                aria-pressed={activeCategory === category.extension}
                className={`size-5 border focus-visible:outline-2 focus-visible:outline-accent ${
                  activeCategory === category.extension ? "border-foreground" : "border-transparent"
                }`}
                key={category.extension}
                onClick={() =>
                  setActiveCategory((current) =>
                    current === category.extension ? null : category.extension,
                  )
                }
                title={`${category.extension}: ${category.count}`}
                type="button"
              >
                <span className="mx-auto block size-2" style={{ backgroundColor: category.color }} />
              </button>
            ))}
          </div>
        </aside>

        <main className="relative min-h-0 min-w-0 bg-background">
          <ReactFlow<ModuleFlowNode, DependencyFlowEdge>
            nodes={nodes}
            edges={edges}
            nodeTypes={moduleNodeTypes}
            nodesConnectable={false}
            nodesDraggable={false}
            edgesFocusable={false}
            minZoom={0.08}
            maxZoom={1.5}
            fitView
            fitViewOptions={{ padding: 0.12, maxZoom: 0.9 }}
            proOptions={{ hideAttribution: true }}
            onNodeClick={(_, node) => {
              if (expandedIds.has(node.id)) return;
              setSelection({ kind: "node", id: node.id });
              setExpandedIds((current) => new Set(current).add(node.id));
              setRefitVersion((version) => version + 1);
            }}
            onNodeMouseEnter={(_, node) =>
              setHovered({ kind: "node", id: node.id })
            }
            onNodeMouseLeave={() => setHovered(null)}
            onPaneClick={() => setSelection(null)}
          >
            <Background
              variant={BackgroundVariant.Dots}
              gap={18}
              size={1}
              color="var(--border)"
            />
            <Controls
              position="bottom-right"
              showInteractive={false}
              className="!overflow-hidden !rounded-none !border !border-border !bg-surface !shadow-none [&_button]:!border-border [&_button]:!bg-surface [&_button]:!fill-foreground"
            />
          </ReactFlow>
          <div className="pointer-events-none absolute left-3 top-3 border border-border bg-surface/95 px-2 py-1 text-[9px] text-muted">
            Open a module to inspect its files
          </div>
        </main>

        <aside
          aria-label="Details"
          className="flex min-h-0 flex-col border-l border-border bg-surface"
        >
          <DetailPane
            activeTab={detailTab}
            framework={framework}
            graph={graph}
            hovered={hovered}
            insights={insights}
            repositoryName={repositoryName}
            routeCount={routeCount}
            selection={selection}
            unidentifiedFileCount={unidentifiedFileCount}
            onHover={setHovered}
            onSelectFile={selectFile}
            onTabChange={setDetailTab}
          />
        </aside>
      </div>
    </div>
  );
}

function DetailPane({
  activeTab,
  framework,
  graph,
  hovered,
  insights,
  repositoryName,
  routeCount,
  selection,
  unidentifiedFileCount,
  onHover,
  onSelectFile,
  onTabChange,
}: {
  activeTab: DetailTab;
  framework: string | null;
  graph: FoldedGraph;
  hovered: Exclude<Selection, null> | null;
  insights: GraphInsights;
  repositoryName: string;
  routeCount: number;
  selection: Selection;
  unidentifiedFileCount: number;
  onHover: (target: Exclude<Selection, null> | null) => void;
  onSelectFile: (path: string) => void;
  onTabChange: (tab: DetailTab) => void;
}) {
  const selectedFile =
    selection?.kind === "file" ? findFile(graph, selection.path) : null;
  const selectedNode =
    selection?.kind === "node"
      ? graph.nodes.find((node) => node.id === selection.id) ?? null
      : null;
  const title = selectedFile?.path ?? selectedNode?.label ?? repositoryName;

  return (
    <>
      <div className="flex h-9 shrink-0 items-center border-b border-border px-3">
        <span className="min-w-0 truncate font-mono text-[9px] font-semibold" title={title}>
          {title}
        </span>
      </div>
      <div className="grid h-8 shrink-0 grid-cols-2 border-b border-border" role="tablist">
        {(["structure", "explanation"] as const).map((tab) => (
          <button
            aria-selected={activeTab === tab}
            className={`border-r border-border text-[9px] last:border-r-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
              activeTab === tab
                ? "bg-surface-muted font-semibold text-foreground"
                : "text-muted hover:text-foreground"
            }`}
            key={tab}
            onClick={() => onTabChange(tab)}
            role="tab"
            type="button"
          >
            {tab === "structure" ? "Structure" : "Explanation"}
          </button>
        ))}
      </div>
      <div className="tool-scrollbar min-h-0 flex-1 overflow-y-auto">
        {activeTab === "explanation" ? (
          <div className="px-3 py-5">
            <p className="text-[11px] font-medium">No explanation yet</p>
            <p className="mt-1 text-[10px] leading-4 text-muted">
              Explanations will appear here when model calls are available.
            </p>
          </div>
        ) : selectedFile ? (
          <FileDetails
            file={selectedFile}
            graph={graph}
            hovered={hovered}
            key={selectedFile.path}
            onHover={onHover}
            onSelectFile={onSelectFile}
          />
        ) : selectedNode ? (
          <FolderDetails node={selectedNode} />
        ) : (
          <RepositoryDetails
            framework={framework}
            graph={graph}
            hovered={hovered}
            repositoryName={repositoryName}
            routeCount={routeCount}
            unidentifiedFileCount={unidentifiedFileCount}
            onHover={onHover}
            onSelectFile={onSelectFile}
          />
        )}
        {activeTab === "structure" ? (
          <InsightsPanel
            graph={graph}
            insights={insights}
            hovered={hovered}
            onHover={onHover}
            onSelectFile={onSelectFile}
          />
        ) : null}
      </div>
    </>
  );
}

function RepositoryDetails({
  framework,
  graph,
  hovered,
  repositoryName,
  routeCount,
  unidentifiedFileCount,
  onHover,
  onSelectFile,
}: {
  framework: string | null;
  graph: FoldedGraph;
  hovered: Exclude<Selection, null> | null;
  repositoryName: string;
  routeCount: number;
  unidentifiedFileCount: number;
  onHover: (target: Exclude<Selection, null> | null) => void;
  onSelectFile: (path: string) => void;
}) {
  const files = graph.nodes.flatMap((node) => node.files);
  const mostDependedOn = files
    .filter((file) => file.fanIn > 0)
    .toSorted((left, right) => right.fanIn - left.fanIn || left.path.localeCompare(right.path))
    .slice(0, 8);
  const readingStarts = files
    .filter((file) => file.fanIn === 0)
    .toSorted((left, right) => right.fanOut - left.fanOut || left.path.localeCompare(right.path))
    .slice(0, 8);

  return (
    <div className="pb-4">
      <div className="border-b border-border px-3 py-3">
        <p className="font-mono text-xs font-semibold">{repositoryName}</p>
        <p className="mt-1 text-[10px] text-muted">
          Framework: {framework ?? "not detected"}
        </p>
      </div>
      <div className="grid grid-cols-3 border-b border-border">
        <Metric label="Files" value={files.length} />
        <Metric label="Imports" value={graph.edges.length} />
        <Metric label="Routes" value={routeCount} />
      </div>
      <DetailSection title="Most depended on">
        {mostDependedOn.map((file) => (
          <PathButton
            count={file.fanIn}
            countLabel="imports"
            graph={graph}
            hovered={hovered}
            key={file.path}
            path={file.path}
            onHover={onHover}
            onSelect={onSelectFile}
          />
        ))}
      </DetailSection>
      <DetailSection title="Where to start reading">
        {readingStarts.map((file) => (
          <PathButton
            count={file.fanOut}
            countLabel="dependencies"
            graph={graph}
            hovered={hovered}
            key={file.path}
            path={file.path}
            onHover={onHover}
            onSelect={onSelectFile}
          />
        ))}
      </DetailSection>
      <div className="mx-3 mt-3 flex items-center justify-between border border-border bg-surface-muted px-2 py-2 text-[10px]">
        <span className="text-muted">Convention unidentified</span>
        <span className="font-mono font-semibold tabular-nums">{unidentifiedFileCount}</span>
      </div>
    </div>
  );
}

function FileDetails({
  file,
  graph,
  hovered,
  onHover,
  onSelectFile,
}: {
  file: CanvasFile;
  graph: FoldedGraph;
  hovered: Exclude<Selection, null> | null;
  onHover: (target: Exclude<Selection, null> | null) => void;
  onSelectFile: (path: string) => void;
}) {
  const [walkResult, setWalkResult] = useState<WalkResult>(null);
  const dependencies = graph.edges.filter((edge) => edge.sourcePath === file.path);
  const dependents = graph.edges.filter((edge) => edge.targetPath === file.path);

  return (
    <div className="pb-4">
      <div className="border-b border-border px-3 py-3">
        <button
          className="break-all text-left font-mono text-[11px] font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          onClick={() => onSelectFile(file.path)}
          type="button"
        >
          {file.path}
        </button>
        <div className="mt-2 grid grid-cols-2 gap-px border border-border bg-border">
          <Fact label="Kind" value={file.moduleKind.toUpperCase()} />
          <Fact label="Length" value={`${file.lineCount} lines`} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-px border border-border bg-border">
          <WalkButton
            active={walkResult?.direction === "incoming"}
            direction="incoming"
            label="Blast radius"
            onClick={() =>
              setWalkResult({
                direction: "incoming",
                paths: walkDependencies(file.path, graph.edges, "incoming"),
              })
            }
          />
          <WalkButton
            active={walkResult?.direction === "outgoing"}
            direction="outgoing"
            label="Dependency chain"
            onClick={() =>
              setWalkResult({
                direction: "outgoing",
                paths: walkDependencies(file.path, graph.edges, "outgoing"),
              })
            }
          />
        </div>
      </div>
      {walkResult ? (
        <DetailSection
          title={`${walkResult.direction === "incoming" ? "Blast radius" : "Dependency chain"} (${walkResult.paths.length})`}
        >
          {walkResult.paths.length === 0 ? (
            <EmptyList>No files within two levels.</EmptyList>
          ) : (
            walkResult.paths.map((path) => (
              <PathButton
                graph={graph}
                hovered={hovered}
                key={path}
                path={path}
                onHover={onHover}
                onSelect={onSelectFile}
              />
            ))
          )}
        </DetailSection>
      ) : null}
      <DetailSection title={`Dependencies (${dependencies.length})`}>
        {dependencies.length === 0 ? (
          <EmptyList>Imports no repository files.</EmptyList>
        ) : (
          dependencies.map((edge, index) => (
            <PathButton
              graph={graph}
              hovered={hovered}
              key={`${edge.targetPath}:${edge.kind}:${edge.specifier}:${index}`}
              path={edge.targetPath}
              onHover={onHover}
              onSelect={onSelectFile}
            />
          ))
        )}
      </DetailSection>
      <DetailSection title={`Dependents (${dependents.length})`}>
        {dependents.length === 0 ? (
          <EmptyList>Nothing imports this file.</EmptyList>
        ) : (
          dependents.map((edge, index) => (
            <PathButton
              graph={graph}
              hovered={hovered}
              key={`${edge.sourcePath}:${edge.kind}:${edge.specifier}:${index}`}
              path={edge.sourcePath}
              onHover={onHover}
              onSelect={onSelectFile}
            />
          ))
        )}
      </DetailSection>
    </div>
  );
}

function WalkButton({
  active,
  direction,
  label,
  onClick,
}: {
  active: boolean;
  direction: WalkDirection;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`bg-surface px-2 py-2 text-left text-[9px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
        active
          ? direction === "incoming"
            ? "text-incoming shadow-[inset_0_2px_0_var(--incoming)]"
            : "text-outgoing shadow-[inset_0_2px_0_var(--outgoing)]"
          : "text-muted hover:bg-surface-muted hover:text-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function InsightsPanel({
  graph,
  insights,
  hovered,
  onHover,
  onSelectFile,
}: {
  graph: FoldedGraph;
  insights: GraphInsights;
  hovered: Exclude<Selection, null> | null;
  onHover: (target: Exclude<Selection, null> | null) => void;
  onSelectFile: (path: string) => void;
}) {
  const insightCount =
    insights.unimported.length +
    insights.unusualFanIn.length +
    insights.cycles.length +
    insights.oversized.length;

  return (
    <details className="group border-t border-border">
      <summary className="flex cursor-pointer list-none items-center justify-between bg-surface-muted px-3 py-2 text-[9px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="w-2 font-mono text-muted group-open:hidden">+</span>
          <span aria-hidden="true" className="hidden w-2 font-mono text-muted group-open:inline">−</span>
          Insights
        </span>
        <span className="font-mono tabular-nums text-muted">{insightCount}</span>
      </summary>
      <InsightGroup
        graph={graph}
        paths={insights.unimported}
        sentence={insightSentences.unimported}
        hovered={hovered}
        onHover={onHover}
        onSelectFile={onSelectFile}
      />
      <InsightGroup
        graph={graph}
        paths={insights.unusualFanIn}
        sentence={insightSentences.unusualFanIn}
        hovered={hovered}
        onHover={onHover}
        onSelectFile={onSelectFile}
      />
      <section className="border-b border-border">
        <p className="px-3 pb-1 pt-2 text-[9px] leading-4 text-muted">
          {insightSentences.cycles}
        </p>
        {insights.cycles.length === 0 ? (
          <EmptyList>None found.</EmptyList>
        ) : (
          insights.cycles.map((cycle) => (
            <div className="border-t border-border" key={cycle.join("\u0000")}>
              {cycle.map((path, index) => (
                <PathButton
                  count={index + 1}
                  countLabel="cycle step"
                  graph={graph}
                  hovered={hovered}
                  key={`${path}:${index}`}
                  path={path}
                  onHover={onHover}
                  onSelect={onSelectFile}
                />
              ))}
            </div>
          ))
        )}
      </section>
      <InsightGroup
        graph={graph}
        paths={insights.oversized}
        sentence={insightSentences.oversized}
        hovered={hovered}
        onHover={onHover}
        onSelectFile={onSelectFile}
      />
    </details>
  );
}

function InsightGroup({
  graph,
  paths,
  sentence,
  hovered,
  onHover,
  onSelectFile,
}: {
  graph: FoldedGraph;
  paths: readonly string[];
  sentence: string;
  hovered: Exclude<Selection, null> | null;
  onHover: (target: Exclude<Selection, null> | null) => void;
  onSelectFile: (path: string) => void;
}) {
  return (
    <section className="border-b border-border">
      <p className="px-3 pb-1 pt-2 text-[9px] leading-4 text-muted">{sentence}</p>
      {paths.length === 0 ? (
        <EmptyList>None found.</EmptyList>
      ) : (
        paths.map((path) => (
          <PathButton
            graph={graph}
            hovered={hovered}
            key={path}
            path={path}
            onHover={onHover}
            onSelect={onSelectFile}
          />
        ))
      )}
    </section>
  );
}

function FolderDetails({ node }: { node: FoldedNode }) {
  const kindCounts = new Map<string, number>();
  for (const file of node.files) {
    kindCounts.set(file.moduleKind, (kindCounts.get(file.moduleKind) ?? 0) + 1);
  }

  return (
    <div>
      <div className="border-b border-border px-3 py-3">
        <p className="break-all font-mono text-[11px] font-semibold">{node.id}</p>
        <p className="mt-1 text-[10px] text-muted">{node.files.length} files</p>
      </div>
      <DetailSection title="File kinds">
        {[...kindCounts.entries()]
          .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .map(([kind, count]) => (
            <div
              className="flex items-center justify-between border-b border-border px-3 py-2 font-mono text-[10px] last:border-b-0"
              key={kind}
            >
              <span>{kind.toUpperCase()}</span>
              <span className="tabular-nums text-muted">{count}</span>
            </div>
          ))}
      </DetailSection>
    </div>
  );
}

function DetailSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="border-b border-border last:border-b-0">
      <h2 className="border-b border-border bg-surface-muted px-3 py-1.5 text-[9px] font-semibold text-muted">
        {title}
      </h2>
      {children}
    </section>
  );
}

function PathButton({
  count,
  countLabel,
  graph,
  hovered,
  path,
  onHover,
  onSelect,
}: {
  count?: number;
  countLabel?: string;
  graph: FoldedGraph;
  hovered: Exclude<Selection, null> | null;
  path: string;
  onHover: (target: Exclude<Selection, null> | null) => void;
  onSelect: (path: string) => void;
}) {
  const highlighted =
    hovered?.kind === "file"
      ? hovered.path === path
      : hovered?.kind === "node" && graph.fileToNode[path] === hovered.id;

  return (
    <button
      className={`flex w-full items-center gap-2 border-b border-border px-3 py-2 text-left font-mono text-[9px] last:border-b-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
        highlighted ? "bg-surface-muted text-accent" : "hover:bg-surface-muted"
      }`}
      onClick={() => onSelect(path)}
      onMouseEnter={() => onHover({ kind: "file", path })}
      onMouseLeave={() => onHover(null)}
      title={path}
      type="button"
    >
      <span className="min-w-0 flex-1 break-all">{path}</span>
      {count !== undefined ? (
        <span className="shrink-0 tabular-nums text-muted" title={`${count} ${countLabel}`}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="border-r border-border px-2 py-2.5 last:border-r-0">
      <p className="font-mono text-sm font-semibold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[8px] text-muted">{label}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-surface-muted px-2 py-2">
      <p className="text-[8px] text-muted">{label}</p>
      <p className="mt-0.5 font-mono text-[10px]">{value}</p>
    </div>
  );
}

function EmptyList({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-3 text-[10px] text-muted">{children}</p>;
}

function findFile(graph: FoldedGraph, filePath: string): CanvasFile | null {
  const nodeId = graph.fileToNode[filePath];
  return graph.nodes.find((node) => node.id === nodeId)?.files.find(
    (file) => file.path === filePath,
  ) ?? null;
}

function ModuleNode({ data, selected }: NodeProps<ModuleFlowNode>) {
  const {
    folderNode,
    expanded,
    dimmed,
    selectedFile,
    hoveredFile,
    activeCategory,
    fileTypeColors,
    onClose,
    onHoverFile,
    onHoverNode,
    onSelectFile,
  } = data;
  const updateNodeInternals = useUpdateNodeInternals();
  const categoryMatchCount = activeCategory
    ? folderNode.files.filter((file) => fileExtension(file.path) === activeCategory).length
    : null;

  if (!expanded) {
    return (
      <div
        className={`relative flex size-full flex-col justify-between border bg-surface px-3 py-2 font-mono shadow-[2px_2px_0_var(--border)] ${
          selected ? "border-accent" : "border-border"
        } ${
          dimmed ? "opacity-15" : "opacity-100"
        }`}
      >
        <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-incoming" />
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold">{folderNode.label}</p>
          <p className="mt-0.5 text-[9px] text-muted">
            {categoryMatchCount === null
              ? `${folderNode.files.length} files`
              : `${categoryMatchCount} / ${folderNode.files.length} match`}
          </p>
        </div>
        <div className="flex items-center justify-between text-[8px] tabular-nums">
          <span
            className="text-incoming"
            aria-label={`${folderNode.fanIn} incoming dependencies`}
            title={`${folderNode.fanIn} incoming dependencies`}
          >
            ← {folderNode.fanIn}
          </span>
          <span
            className="text-outgoing"
            aria-label={`${folderNode.fanOut} outgoing dependencies`}
            title={`${folderNode.fanOut} outgoing dependencies`}
          >
            {folderNode.fanOut} →
          </span>
        </div>
        <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-outgoing" />
      </div>
    );
  }

  return (
    <div
      className={`relative flex size-full flex-col border bg-surface font-mono shadow-[3px_3px_0_var(--border)] ${
        selected ? "border-accent" : "border-border"
      } ${
        dimmed ? "opacity-15" : "opacity-100"
      }`}
    >
      <Handle
        id="node-in"
        type="target"
        position={Position.Left}
        className="!top-6 !size-1.5 !border-0 !bg-incoming"
      />
      <button
        type="button"
        className="nodrag flex h-12 w-full shrink-0 items-center justify-between border-b border-border px-3 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent"
        onClick={(event) => {
          event.stopPropagation();
          onClose(folderNode.id);
        }}
      >
        <span className="min-w-0">
          <span className="block truncate text-[11px] font-semibold">{folderNode.label}</span>
          <span className="block text-[8px] text-muted">
            {categoryMatchCount === null
              ? `${folderNode.files.length} files`
              : `${categoryMatchCount} / ${folderNode.files.length} match`}
          </span>
        </span>
        <span className="flex shrink-0 gap-2 text-[8px] tabular-nums">
          <span
            className="text-incoming"
            aria-label={`${folderNode.fanIn} incoming dependencies`}
            title={`${folderNode.fanIn} incoming dependencies`}
          >
            ← {folderNode.fanIn}
          </span>
          <span
            className="text-outgoing"
            aria-label={`${folderNode.fanOut} outgoing dependencies`}
            title={`${folderNode.fanOut} outgoing dependencies`}
          >
            {folderNode.fanOut} →
          </span>
        </span>
      </button>
      <Handle
        id="node-out"
        type="source"
        position={Position.Right}
        className="!top-6 !size-1.5 !border-0 !bg-outgoing"
      />

      <div
        className="tool-scrollbar nodrag nopan nowheel min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        onScroll={() => updateNodeInternals(folderNode.id)}
      >
        {folderNode.files.map((file) => (
          <FileRow
            file={file}
            color={fileTypeColors[fileExtension(file.path)] ?? "var(--muted)"}
            key={file.path}
            selected={selectedFile === file.path}
            hovered={hoveredFile === file.path}
            dimmed={
              activeCategory !== null && fileExtension(file.path) !== activeCategory
            }
            onHover={() => onHoverFile(file.path)}
            onLeave={() => onHoverNode(folderNode.id)}
            onSelect={onSelectFile}
          />
        ))}
      </div>
    </div>
  );
}

function FileRow({
  file,
  color,
  selected,
  hovered,
  dimmed,
  onHover,
  onLeave,
  onSelect,
}: {
  file: CanvasFile;
  color: string;
  selected: boolean;
  hovered: boolean;
  dimmed: boolean;
  onHover: () => void;
  onLeave: () => void;
  onSelect: (path: string) => void;
}) {
  const name = fileName(file.path);
  return (
    <div
      className={`relative h-6 border-b border-border last:border-b-0 ${
        dimmed ? "opacity-15" : ""
      }`}
    >
      <Handle
        id={`in:${file.path}`}
        type="target"
        position={Position.Left}
        className="!size-1 !border-0 !bg-incoming"
      />
      <button
        type="button"
        className={`nodrag flex size-full items-center gap-2 px-3 text-left text-[9px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
          selected
            ? "bg-accent text-background"
            : hovered
              ? "bg-surface-muted outline outline-1 outline-accent"
              : "hover:bg-surface-muted"
        }`}
        onClick={(event) => {
          event.stopPropagation();
          onSelect(file.path);
        }}
        onMouseEnter={(event) => {
          event.stopPropagation();
          onHover();
        }}
        onMouseLeave={(event) => {
          event.stopPropagation();
          onLeave();
        }}
        title={file.path}
      >
        <span className="size-1.5 shrink-0" style={{ backgroundColor: color }} />
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <span
          className={selected ? "text-background/70" : "text-incoming"}
          title={`${file.fanIn} incoming dependencies`}
        >
          ← {file.fanIn}
        </span>
        <span
          className={selected ? "text-background/70" : "text-outgoing"}
          title={`${file.fanOut} outgoing dependencies`}
        >
          {file.fanOut} →
        </span>
      </button>
      <Handle
        id={`out:${file.path}`}
        type="source"
        position={Position.Right}
        className="!size-1 !border-0 !bg-outgoing"
      />
    </div>
  );
}

function fileExtension(filePath: string): string {
  const name = fileName(filePath);
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(dot + 1) : "other";
}

function fileName(filePath: string): string {
  return filePath.split("/").at(-1) ?? filePath;
}

function nodeDimensions(node: FoldedNode, expanded: boolean) {
  if (expanded) {
    const visibleRows = Math.min(node.files.length, maxVisibleRows);
    const longestFileName = node.files.reduce(
      (longest, file) => Math.max(longest, fileName(file.path).length),
      0,
    );
    const headerWidth = 120 + node.label.length * 6.2;
    const fileRowWidth = 124 + longestFileName * 5.5;
    return {
      width: Math.max(280, Math.min(440, Math.ceil(Math.max(headerWidth, fileRowWidth)))),
      height: 48 + visibleRows * 24,
    };
  }

  return {
    width: Math.max(132, Math.min(238, 76 + node.label.length * 6.2)),
    height: 52 + Math.min(94, Math.log2(node.fanIn + 1) * 16),
  };
}

function layoutNodes(
  modules: readonly FoldedNode[],
  edges: readonly DependencyFlowEdge[],
  dimensions: ReadonlyMap<string, { width: number; height: number }>,
): Map<string, { x: number; y: number }> {
  const dagre = new Graph().setDefaultEdgeLabel(() => ({}));
  dagre.setGraph({ rankdir: "LR", ranksep: 110, nodesep: 42, marginx: 24, marginy: 24 });

  for (const folderNode of modules) {
    dagre.setNode(folderNode.id, dimensions.get(folderNode.id)!);
  }
  const pairs = new Set<string>();
  for (const edge of edges) {
    if (edge.source === edge.target) continue;
    const key = `${edge.source}\u0000${edge.target}`;
    if (pairs.has(key)) continue;
    pairs.add(key);
    dagre.setEdge(edge.source, edge.target);
  }
  layout(dagre);

  return new Map(
    modules.map((folderNode) => {
      const position = dagre.node(folderNode.id);
      const size = dimensions.get(folderNode.id)!;
      return [folderNode.id, { x: position.x - size.width / 2, y: position.y - size.height / 2 }];
    }),
  );
}

function createVisualEdges(
  graph: FoldedGraph,
  expandedIds: ReadonlySet<string>,
): DependencyFlowEdge[] {
  const visualEdges = new Map<string, DependencyFlowEdge>();
  const visibleFiles = new Map(
    graph.nodes.map((node) => [
      node.id,
      new Set(node.files.slice(0, maxVisibleRows).map((file) => file.path)),
    ]),
  );

  for (const edge of graph.edges) {
    const source = graph.fileToNode[edge.sourcePath];
    const target = graph.fileToNode[edge.targetPath];
    const sourceExpanded = expandedIds.has(source);
    const targetExpanded = expandedIds.has(target);
    if (source === target && !sourceExpanded) continue;

    const sourceHandle = sourceExpanded
      ? visibleFiles.get(source)?.has(edge.sourcePath)
        ? `out:${edge.sourcePath}`
        : "node-out"
      : undefined;
    const targetHandle = targetExpanded
      ? visibleFiles.get(target)?.has(edge.targetPath)
        ? `in:${edge.targetPath}`
        : "node-in"
      : undefined;
    const key = [source, sourceHandle ?? "*", target, targetHandle ?? "*"].join("|");
    const existing = visualEdges.get(key);

    if (existing) {
      existing.data!.sourcePaths.push(edge.sourcePath);
      existing.data!.targetPaths.push(edge.targetPath);
    } else {
      visualEdges.set(key, {
        id: `edge:${key}`,
        source,
        target,
        sourceHandle,
        targetHandle,
        data: { sourcePaths: [edge.sourcePath], targetPaths: [edge.targetPath] },
      });
    }
  }

  return [...visualEdges.values()].toSorted((left, right) => left.id.localeCompare(right.id));
}

function getActiveElements(
  graph: FoldedGraph,
  edges: readonly DependencyFlowEdge[],
  selection: Selection,
): {
  nodeIds: Set<string>;
  edgeIds: Set<string>;
  edgeDirections: Map<string, EdgeDirection>;
} {
  const nodeIds = new Set<string>();
  const edgeIds = new Set<string>();
  const edgeDirections = new Map<string, EdgeDirection>();
  if (!selection) return { nodeIds, edgeIds, edgeDirections };

  if (selection.kind === "node") nodeIds.add(selection.id);
  else nodeIds.add(graph.fileToNode[selection.path]);

  for (const edge of edges) {
    const outgoing =
      selection.kind === "node"
        ? edge.source === selection.id
        : edge.data?.sourcePaths.includes(selection.path) === true;
    const incoming =
      selection.kind === "node"
        ? edge.target === selection.id
        : edge.data?.targetPaths.includes(selection.path) === true;
    if (!outgoing && !incoming) continue;
    edgeIds.add(edge.id);
    edgeDirections.set(
      edge.id,
      outgoing && incoming ? "both" : outgoing ? "outgoing" : "incoming",
    );
    nodeIds.add(edge.source);
    nodeIds.add(edge.target);
  }

  return { nodeIds, edgeIds, edgeDirections };
}

function edgeMatchesCategory(
  edge: DependencyFlowEdge,
  category: string,
): boolean {
  return [...(edge.data?.sourcePaths ?? []), ...(edge.data?.targetPaths ?? [])].some(
    (path) => fileExtension(path) === category,
  );
}
