"use client";

import "@xyflow/react/dist/style.css";

import {
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useUpdateNodeInternals,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type NodeProps,
} from "@xyflow/react";
import { Graph, layout } from "@dagrejs/dagre";
import {
  FolderTree,
  LayoutDashboard,
  MessageSquareText,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";

import { requestExplanation, rerunAnalysis } from "@/app/actions";
import { AskPanel } from "@/components/ask-panel";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { WorkspaceHeader } from "@/components/workspace-header";
import type { ExplanationResult, ExplanationTarget } from "@/lib/ai/explain";
import {
  insightSentences,
  walkDependencies,
  type GraphInsights,
  type WalkDirection,
} from "@/lib/graph/analysis";
import type { CanvasFile, FoldedGraph, FoldedNode } from "@/lib/graph/fold";

interface Category {
  role: string;
  label: string;
  count: number;
  color: string;
}

interface Route {
  filePath: string;
  method: string;
  path: string;
}

interface AnalysisCanvasProps {
  analysisId: string;
  repositoryName: string;
  framework: string | null;
  graph: FoldedGraph;
  insights: GraphInsights;
  categories: Category[];
  routes: Route[];
  unidentifiedFileCount: number;
  tracingConfigured: boolean;
}

type Selection =
  | { kind: "node"; id: string }
  | { kind: "file"; path: string }
  | null;
type HoveredSelection = Exclude<Selection, null> & { source: "canvas" | "detail" };

type DetailTab = "structure" | "explanation";
type PaneMode = "overview" | "ask";

interface ModuleNodeData extends Record<string, unknown> {
  folderNode: FoldedNode;
  expanded: boolean;
  dimmed: boolean;
  selectedFile: string | null;
  hoveredFile: string | null;
  activeRole: string | null;
  roleColors: Record<string, string>;
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

export function AnalysisCanvas(props: AnalysisCanvasProps) {
  return (
    <ReactFlowProvider>
      <Canvas {...props} />
    </ReactFlowProvider>
  );
}

/** Coordinate graph selection, category dimming, layout, and the detail pane. */
function Canvas({
  analysisId,
  repositoryName,
  framework,
  graph,
  insights,
  categories,
  routes,
  unidentifiedFileCount,
  tracingConfigured,
}: AnalysisCanvasProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [selection, setSelection] = useState<Selection>(null);
  const [hovered, setHovered] = useState<HoveredSelection | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("structure");
  const [paneMode, setPaneMode] = useState<PaneMode>("overview");
  const [activeRole, setActiveRole] = useState<string | null>(null);
  const [refitVersion, setRefitVersion] = useState(0);
  const [explanations, setExplanations] = useState<Record<string, ExplanationResult>>({});
  const { fitView, getZoom } = useReactFlow<ModuleFlowNode, DependencyFlowEdge>();
  const fileCount = Object.keys(graph.fileToNode).length;
  const displayedCategories = categories.map((category) => ({
    ...category,
    label: category.role === "source" ? "Other" : category.label,
  }));

  const closeNode = useCallback((id: string): void => {
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
  }, [graph.fileToNode]);

  const selectFile = useCallback((filePath: string): void => {
    const nodeId = graph.fileToNode[filePath];
    if (!expandedIds.has(nodeId)) {
      setExpandedIds((current) => new Set(current).add(nodeId));
      setRefitVersion((version) => version + 1);
    }
    setHovered(null);
    setSelection({ kind: "file", path: filePath });
  }, [expandedIds, graph.fileToNode]);

  const hoverFile = useCallback((path: string | null): void => {
    setHovered(path === null ? null : { kind: "file", path, source: "canvas" });
  }, []);
  const hoverNode = useCallback((id: string | null): void => {
    setHovered(id === null ? null : { kind: "node", id, source: "canvas" });
  }, []);
  const hoverDetail = useCallback((target: Exclude<Selection, null> | null): void => {
    setHovered(target === null ? null : { ...target, source: "detail" });
  }, []);

  const visualEdges = useMemo(
    () => createVisualEdges(graph, expandedIds),
    [expandedIds, graph],
  );
  const active = useMemo(
    () => getActiveElements(graph, visualEdges, selection),
    [graph, selection, visualEdges],
  );
  const roleColors = useMemo(
    () => Object.fromEntries(
      categories.map((category) => [category.role, category.color]),
    ),
    [categories],
  );
  const dimensions = useMemo(
    () => new Map(
      graph.nodes.map((node) => [node.id, nodeDimensions(node, expandedIds.has(node.id))]),
    ),
    [expandedIds, graph.nodes],
  );
  const positions = useMemo(
    () => layoutNodes(graph.nodes, visualEdges, dimensions),
    [dimensions, graph.nodes, visualEdges],
  );

  const baseNodes = useMemo<ModuleFlowNode[]>(
    () => graph.nodes.map((folderNode) => {
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
            activeRole !== null
              ? !folderNode.files.some((file) => file.role === activeRole)
              : selection !== null && !active.nodeIds.has(folderNode.id),
          selectedFile:
            selection?.kind === "file" ? selection.path : null,
          hoveredFile: null,
          activeRole,
          roleColors,
          onClose: closeNode,
          onHoverFile: hoverFile,
          onHoverNode: hoverNode,
          onSelectFile: selectFile,
        },
        style: { width: size.width, height: size.height },
        draggable: false,
        selectable: true,
        selected: selection?.kind === "node" && selection.id === folderNode.id,
        ariaLabel: `${folderNode.label}, ${folderNode.files.length} files, imported by ${folderNode.fanIn}, imports ${folderNode.fanOut}`,
      };
    }),
    [
      active.nodeIds,
      activeRole,
      closeNode,
      dimensions,
      expandedIds,
      graph.nodes,
      hoverFile,
      hoverNode,
      positions,
      roleColors,
      selectFile,
      selection,
    ],
  );
  const hoveredFile = hovered?.kind === "file" ? hovered.path : null;
  const externallyHoveredFile = hovered?.source === "detail" ? hoveredFile : null;
  const nodes = useMemo<ModuleFlowNode[]>(() => {
    if (externallyHoveredFile === null) return baseNodes;

    const nodeId = graph.fileToNode[externallyHoveredFile];
    return baseNodes.map((node) =>
      node.id === nodeId
        ? { ...node, data: { ...node.data, hoveredFile: externallyHoveredFile } }
        : node,
    );
  }, [baseNodes, externallyHoveredFile, graph.fileToNode]);

  const edges = useMemo<DependencyFlowEdge[]>(
    () => visualEdges.map((edge) => {
      const direction = active.edgeDirections.get(edge.id);
      const markerAtSource = direction === undefined || direction === "incoming";
      const stroke =
        direction === "incoming"
          ? "var(--imported-by)"
          : direction === "outgoing"
            ? "var(--imports)"
            : direction === "both"
              ? "var(--imports)"
              : "var(--muted-foreground)";

      return {
        ...edge,
        type: "default",
        animated: false,
        selectable: false,
        zIndex: active.edgeIds.has(edge.id) ? 2 : 1,
        markerStart: markerAtSource ? {
          type: MarkerType.ArrowClosed,
          color: stroke,
          width: active.edgeIds.has(edge.id) ? 16 : 13,
          height: active.edgeIds.has(edge.id) ? 16 : 13,
        } : undefined,
        markerEnd: markerAtSource ? undefined : {
          type: MarkerType.ArrowClosed,
          color: stroke,
          width: active.edgeIds.has(edge.id) ? 16 : 13,
          height: active.edgeIds.has(edge.id) ? 16 : 13,
        },
        pathOptions: { curvature: edgeCurvature(edge.id, edge.source === edge.target) },
        style: {
          stroke,
          strokeWidth: active.edgeIds.has(edge.id) ? 2 : 1,
          strokeLinecap: "round",
          strokeLinejoin: "round",
          opacity:
            activeRole !== null
              ? edgeMatchesRole(graph, edge, activeRole)
                ? 0.45
                : 0.04
              : selection === null
                ? 0.38
                : active.edgeIds.has(edge.id)
                  ? 0.9
                  : 0.06,
        },
      };
    }),
    [active.edgeDirections, active.edgeIds, activeRole, graph, selection, visualEdges],
  );

  const handleNodeMouseEnter = useCallback<NodeMouseHandler<ModuleFlowNode>>(
    (_, node) => hoverNode(node.id),
    [hoverNode],
  );
  const handleNodeMouseLeave = useCallback<NodeMouseHandler<ModuleFlowNode>>(
    () => hoverNode(null),
    [hoverNode],
  );

  useEffect(() => {
    if (refitVersion === 0) return;
    const frame = requestAnimationFrame(() => {
      void fitView({ padding: 0.12, maxZoom: getZoom(), duration: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [fitView, getZoom, refitVersion]);

  return (
    <div className="flex h-dvh min-h-96 flex-col overflow-hidden bg-background text-foreground">
      <WorkspaceHeader projectName={repositoryName} />

      <div className="grid min-h-0 flex-1 grid-cols-[3rem_minmax(18rem,1fr)_18rem] overflow-x-auto md:grid-cols-[11rem_minmax(18rem,1fr)_18rem]">
        <aside
          aria-label="File categories"
          className="tool-scrollbar min-h-0 overflow-y-auto border-r border-border bg-background"
        >
          <div className="flex h-11 items-center justify-center px-3 md:justify-start">
            <span className="text-[10px] font-semibold text-muted-foreground">
              <span className="md:hidden">F</span>
              <span className="hidden md:inline">File roles</span>
            </span>
          </div>
          <div className="hidden space-y-1 px-2 pb-3 md:block">
            <button
              aria-pressed={activeRole === null}
              className={`grid w-full grid-cols-[8px_1fr_auto] items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-imports ${
                activeRole === null
                  ? "border-border bg-surface-muted font-semibold text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:bg-surface-muted hover:text-foreground"
              }`}
              onClick={() => setActiveRole(null)}
              type="button"
            >
              <span className="size-2 rounded-sm bg-foreground" />
              <span>All</span>
              <span className="text-muted-foreground">{fileCount}</span>
            </button>
            {displayedCategories.map((category) => (
              <button
                aria-pressed={activeRole === category.role}
                className={`grid w-full grid-cols-[8px_1fr_auto] items-center gap-2 rounded-md border px-2.5 py-2 text-left text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-imports ${
                  activeRole === category.role
                    ? "border-border bg-surface-muted font-semibold text-foreground"
                    : "border-transparent text-muted-foreground hover:border-border hover:bg-surface-muted hover:text-foreground"
                }`}
                key={category.role}
                onClick={() => setActiveRole(category.role)}
                type="button"
              >
                <span
                  className="size-2 rounded-sm"
                  style={{ backgroundColor: category.color }}
                />
                <span>{category.label}</span>
                <span className="tabular-nums text-muted-foreground">{category.count}</span>
              </button>
            ))}
          </div>
          <div className="flex flex-col items-center gap-2 py-3 md:hidden">
            <button
              aria-label={`All: ${fileCount} files`}
              aria-pressed={activeRole === null}
              className={`grid size-6 place-items-center rounded-md border text-[9px] font-semibold outline-none focus-visible:ring-2 focus-visible:ring-imports ${
                activeRole === null ? "border-foreground" : "border-transparent"
              }`}
              onClick={() => setActiveRole(null)}
              title={`All: ${fileCount}`}
              type="button"
            >
              A
            </button>
            {displayedCategories.map((category) => (
              <button
                aria-label={`${category.label}: ${category.count} files`}
                aria-pressed={activeRole === category.role}
                className={`grid size-6 place-items-center rounded-md border outline-none focus-visible:ring-2 focus-visible:ring-imports ${
                  activeRole === category.role ? "border-foreground" : "border-transparent"
                }`}
                key={category.role}
                onClick={() => setActiveRole(category.role)}
                title={`${category.label}: ${category.count}`}
                type="button"
              >
                <span className="block size-2 rounded-sm" style={{ backgroundColor: category.color }} />
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
              setHovered(null);
              setSelection({ kind: "node", id: node.id });
              setExpandedIds((current) => new Set(current).add(node.id));
              setRefitVersion((version) => version + 1);
            }}
            onNodeMouseEnter={handleNodeMouseEnter}
            onNodeMouseLeave={handleNodeMouseLeave}
            onPaneClick={() => {
              setHovered(null);
              setSelection(null);
            }}
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
              className="!overflow-hidden !rounded-md !border !border-border !bg-surface !shadow-none [&_button]:!border-border [&_button]:!bg-surface [&_button]:!fill-foreground"
            />
          </ReactFlow>
          <div className="pointer-events-none absolute left-3 top-3 rounded-md border border-border bg-background/90 px-2.5 py-2 font-mono text-[10px] shadow-sm backdrop-blur-sm">
            <p className="mb-1.5 text-muted-foreground">Arrow flows from importer to imported file</p>
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-imported-by">
                <svg aria-hidden="true" className="h-2 w-5" viewBox="0 0 20 8">
                  <path d="M19 4 H2 M5 1 L2 4 L5 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                </svg>
                Incoming imports
              </span>
              <span className="flex items-center gap-1.5 text-imports">
                <svg aria-hidden="true" className="h-2 w-5" viewBox="0 0 20 8">
                  <path d="M1 4 H18 M15 1 L18 4 L15 7" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" />
                </svg>
                Outgoing imports
              </span>
            </div>
            {!tracingConfigured ? (
              <p className="mt-1.5 border-t border-border pt-1.5 text-muted-foreground">Tracing off</p>
            ) : null}
          </div>
        </main>

        <aside
          aria-label="Details"
           className="flex min-h-0 flex-col border-l border-border bg-background"
        >
          <Tabs
            className="flex min-h-0 flex-1 gap-0"
            value={paneMode}
            onValueChange={(value) => {
              if (value === "overview" || value === "ask") setPaneMode(value);
            }}
          >
            <TabsList className="mx-3 mt-3 grid h-10 w-auto shrink-0 grid-cols-2 overflow-hidden rounded-md border border-border bg-surface-muted p-1.5">
              {(["overview", "ask"] as const).map((mode) => (
                <TabsTrigger
                  className="h-auto min-h-0 min-w-0 self-stretch rounded-sm border-0 px-2 text-[11px] font-medium transition-none data-active:bg-background data-active:font-semibold data-active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent dark:data-active:bg-surface"
                  key={mode}
                  value={mode}
                >
                  {mode === "overview" ? (
                    <LayoutDashboard aria-hidden="true" className="size-3" />
                  ) : (
                    <MessageSquareText aria-hidden="true" className="size-3" />
                  )}
                  {mode === "overview" ? "Overview" : "Ask"}
                </TabsTrigger>
              ))}
            </TabsList>
            <TabsContent className="flex min-h-0 flex-1 flex-col" value="ask">
              <AskPanel
                analysisId={analysisId}
                knownPaths={graph.fileToNode}
                onSelectFile={selectFile}
                selectedPath={selection?.kind === "file" ? selection.path : null}
              />
            </TabsContent>
            <TabsContent className="flex min-h-0 flex-1 flex-col" value="overview">
              <DetailPane
                analysisId={analysisId}
                activeTab={detailTab}
                framework={framework}
                graph={graph}
                hovered={hovered}
                insights={insights}
                repositoryName={repositoryName}
                routes={routes}
                selection={selection}
                unidentifiedFileCount={unidentifiedFileCount}
                explanations={explanations}
                onHover={hoverDetail}
                onSelectFile={selectFile}
                onStoreExplanation={(key, explanation) =>
                  setExplanations((current) => ({ ...current, [key]: explanation }))
                }
                onTabChange={setDetailTab}
              />
            </TabsContent>
          </Tabs>
        </aside>
      </div>
    </div>
  );
}

/** Show the selected file, module, or repository details, with insights in the structure tab. */
function DetailPane({
  activeTab,
  analysisId,
  framework,
  graph,
  hovered,
  insights,
  repositoryName,
  routes,
  selection,
  unidentifiedFileCount,
  explanations,
  onHover,
  onSelectFile,
  onStoreExplanation,
  onTabChange,
}: {
  activeTab: DetailTab;
  analysisId: string;
  framework: string | null;
  graph: FoldedGraph;
  hovered: Exclude<Selection, null> | null;
  insights: GraphInsights;
  repositoryName: string;
  routes: Route[];
  selection: Selection;
  unidentifiedFileCount: number;
  explanations: Record<string, ExplanationResult>;
  onHover: (target: Exclude<Selection, null> | null) => void;
  onSelectFile: (path: string) => void;
  onStoreExplanation: (key: string, explanation: ExplanationResult) => void;
  onTabChange: (tab: DetailTab) => void;
}) {
  const selectedFile =
    selection?.kind === "file" ? findFile(graph, selection.path) : null;
  const selectedNode =
    selection?.kind === "node"
      ? graph.nodes.find((node) => node.id === selection.id) ?? null
      : null;
  const title = selectedFile?.path ?? selectedNode?.label ?? repositoryName;
  const explanationTarget: ExplanationTarget | null = selectedFile
    ? { kind: "file", path: selectedFile.path }
    : selectedNode
      ? { kind: "folder", path: selectedNode.id }
      : null;
  const explanationKey = explanationTarget
    ? `${explanationTarget.kind}:${explanationTarget.path}`
    : null;

  return (
    <Tabs
      className="flex min-h-0 flex-1 gap-0"
      value={activeTab}
      onValueChange={(value) => {
        if (value === "structure" || value === "explanation") onTabChange(value);
      }}
    >
      <div className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-4 py-2">
        <span className="grid size-5 shrink-0 place-items-center rounded-sm bg-surface-muted text-muted-foreground">
          <FolderTree aria-hidden="true" className="size-3" />
        </span>
        <div className="min-w-0">
          <p className="text-[8px] font-medium text-muted-foreground">
            {selectedFile ? "Selected file" : selectedNode ? "Selected folder" : "Repository"}
          </p>
          <p className="truncate font-mono text-[10px] font-semibold" title={title}>
            {title}
          </p>
        </div>
      </div>
      <TabsList className="mx-3 mt-3 grid h-10 w-auto shrink-0 grid-cols-2 overflow-hidden rounded-md border border-border bg-surface-muted p-1.5">
        {(["structure", "explanation"] as const).map((tab) => (
          <TabsTrigger
            className="h-auto min-h-0 min-w-0 self-stretch rounded-sm border-0 px-2 text-[10px] font-medium transition-none data-active:bg-background data-active:font-semibold data-active:shadow-none focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent dark:data-active:bg-surface"
            key={tab}
            value={tab}
          >
            {tab === "structure" ? (
              <FolderTree aria-hidden="true" className="size-3" />
            ) : (
              <Sparkles aria-hidden="true" className="size-3" />
            )}
            {tab === "structure" ? "Structure" : "Explanation"}
          </TabsTrigger>
        ))}
      </TabsList>
      <TabsContent
        className="tool-scrollbar min-h-0 flex-1 overflow-y-auto"
        value="structure"
      >
        {selectedFile ? (
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
            routes={routes}
            unidentifiedFileCount={unidentifiedFileCount}
            onHover={onHover}
            onSelectFile={onSelectFile}
          />
        )}
        <InsightsPanel
          graph={graph}
          insights={insights}
          hovered={hovered}
          onHover={onHover}
          onSelectFile={onSelectFile}
        />
      </TabsContent>
      <TabsContent
        className="tool-scrollbar min-h-0 flex-1 overflow-y-auto"
        value="explanation"
      >
        <ExplanationPane
          analysisId={analysisId}
          explanation={explanationKey ? explanations[explanationKey] : undefined}
          graph={graph}
          target={explanationTarget}
          onSelectFile={onSelectFile}
          onStore={(explanation) => {
            if (explanationKey) onStoreExplanation(explanationKey, explanation);
          }}
        />
      </TabsContent>
    </Tabs>
  );
}

function ExplanationPane({
  analysisId,
  explanation,
  graph,
  target,
  onSelectFile,
  onStore,
}: {
  analysisId: string;
  explanation: ExplanationResult | undefined;
  graph: FoldedGraph;
  target: ExplanationTarget | null;
  onSelectFile: (path: string) => void;
  onStore: (explanation: ExplanationResult) => void;
}) {
  const [isPending, startTransition] = useTransition();

  if (!target) {
    return (
      <div className="px-4 py-5 text-[11px] leading-5 text-muted-foreground">
        Select a file or folded folder to explain it.
      </div>
    );
  }

  const explain = () => {
    startTransition(async () => {
      onStore(await requestExplanation(analysisId, target));
    });
  };

  return (
    <div className="px-4 py-4">
      {explanation?.status === "ready" ? (
        <RestrictedMarkdown
          content={explanation.content}
          paths={explanation.shownPaths.filter((path) => path in graph.fileToNode)}
          onSelectFile={onSelectFile}
        />
      ) : explanation?.status === "stale" ? (
        <Alert className="rounded-none border-0 border-l-2 border-imports bg-transparent p-0 pl-2.5">
          <p className="text-[10px] font-semibold">Analysis is stale</p>
          <p className="mt-1 text-[10px] leading-4 text-muted-foreground">
            The repository has moved past the analysed commit or this file changed.
          </p>
          <form action={rerunAnalysis} className="mt-3">
            <input name="analysisId" type="hidden" value={analysisId} />
            <Button
              className="h-auto rounded-md border-foreground bg-foreground px-3 py-1.5 text-[10px] font-semibold text-surface transition-none hover:border-accent hover:bg-accent"
              type="submit"
            >
              Re-analyse
            </Button>
          </form>
        </Alert>
      ) : explanation?.status === "error" ? (
        <Alert className="rounded-md p-2 text-[10px] leading-4 text-muted-foreground">
          {explanation.message}
        </Alert>
      ) : (
        <p className="text-[10px] leading-4 text-muted-foreground">
          {target.kind === "file"
            ? "Explain this file from its direct imports and dependents."
            : "Explain what is in this folder and why files point at it."}
        </p>
      )}

      {explanation?.status !== "stale" ? (
        <Button
          className="mt-4 h-auto rounded-md border-foreground bg-foreground px-3 py-1.5 text-[10px] font-semibold text-surface transition-none hover:border-accent hover:bg-accent disabled:pointer-events-auto disabled:cursor-wait disabled:border-border disabled:bg-surface-muted disabled:text-muted-foreground disabled:opacity-100"
          disabled={isPending}
          onClick={explain}
          type="button"
        >
          {isPending ? "Explaining..." : explanation?.status === "ready" ? "Explain again" : "Explain"}
        </Button>
      ) : null}
    </div>
  );
}

function RestrictedMarkdown({
  content,
  paths,
  onSelectFile,
}: {
  content: string;
  paths: readonly string[];
  onSelectFile: (path: string) => void;
}) {
  const blocks = content.trim().split(/\n\s*\n/u);

  return (
    <div className="space-y-3 text-[11px] leading-[1.65]">
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").map((line) => line.replace(/^#{1,6}\s*/u, ""));
        if (lines.every((line) => /^[-*]\s+/u.test(line))) {
          return (
            <ul className="space-y-1 pl-3" key={blockIndex}>
              {lines.map((line, lineIndex) => (
                <li className="relative before:absolute before:-left-3 before:text-muted-foreground before:content-['-']" key={lineIndex}>
                  {renderInline(line.replace(/^[-*]\s+/u, ""), paths, onSelectFile)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={blockIndex}>
            {renderInline(lines.join(" "), paths, onSelectFile)}
          </p>
        );
      })}
    </div>
  );
}

function renderInline(
  text: string,
  paths: readonly string[],
  onSelectFile: (path: string) => void,
): React.ReactNode[] {
  const parts = text.split(/(`[^`]*`|\*\*[^*]+\*\*)/u);
  return parts.flatMap((part, index) => {
    if (part.startsWith("`") && part.endsWith("`")) {
      return renderPaths(part.slice(1, -1), paths, onSelectFile, `code-${index}`, true);
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong className="font-semibold" key={`bold-${index}`}>
          {renderPaths(part.slice(2, -2), paths, onSelectFile, `bold-${index}`, false)}
        </strong>
      );
    }
    return renderPaths(part.replace(/[*`#]/gu, ""), paths, onSelectFile, `text-${index}`, false);
  });
}

function renderPaths(
  text: string,
  paths: readonly string[],
  onSelectFile: (path: string) => void,
  keyPrefix: string,
  code: boolean,
): React.ReactNode[] {
  if (paths.length === 0) {
    return [code ? <code className="bg-surface-muted px-1 font-mono" key={keyPrefix}>{text}</code> : text];
  }
  const pattern = new RegExp(`(${paths.map(escapeRegExp).join("|")})`, "gu");
  return text.split(pattern).filter(Boolean).map((part, index) => {
    if (paths.includes(part)) {
      return (
        <button
          className="font-mono text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          key={`${keyPrefix}-${index}`}
          onClick={() => onSelectFile(part)}
          type="button"
        >
          {part}
        </button>
      );
    }
    return code
      ? <code className="bg-surface-muted px-1 font-mono" key={`${keyPrefix}-${index}`}>{part}</code>
      : part;
  });
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function RepositoryDetails({
  framework,
  graph,
  hovered,
  repositoryName,
  routes,
  unidentifiedFileCount,
  onHover,
  onSelectFile,
}: {
  framework: string | null;
  graph: FoldedGraph;
  hovered: Exclude<Selection, null> | null;
  repositoryName: string;
  routes: Route[];
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
    <div className="pb-5">
      <div className="px-4 pb-4 pt-4">
        <p className="font-heading text-base font-semibold tracking-[-0.025em]">{repositoryName}</p>
        <Badge className="mt-2 h-5 max-w-full rounded-sm px-2 font-mono text-[9px] font-medium" variant="outline">
          <span className="truncate">{framework ?? "Framework not detected"}</span>
        </Badge>
      </div>
      <div className="mx-4 grid grid-cols-3 divide-x divide-border overflow-hidden rounded-md border border-border bg-surface">
        <Metric label="Files" value={files.length} />
        <Metric label="Imports" value={graph.edges.length} />
        <Metric label="Routes" value={routes.length} />
      </div>
      <RouteTable
        graph={graph}
        hovered={hovered}
        routes={routes}
        onHover={onHover}
        onSelectFile={onSelectFile}
      />
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
      <div className="mx-4 mt-4 flex items-center justify-between text-[11px]">
        <span className="text-muted-foreground">Convention unidentified</span>
        <span className="font-mono font-semibold tabular-nums">{unidentifiedFileCount}</span>
      </div>
    </div>
  );
}

function RouteTable({
  graph,
  hovered,
  routes,
  onHover,
  onSelectFile,
}: {
  graph: FoldedGraph;
  hovered: Exclude<Selection, null> | null;
  routes: Route[];
  onHover: (target: Exclude<Selection, null> | null) => void;
  onSelectFile: (path: string) => void;
}) {
  return (
    <DetailSection title={`Routes (${routes.length})`}>
      {routes.length === 0 ? (
        <EmptyList>No exact routes found.</EmptyList>
      ) : (
        <Table className="table-fixed border-collapse text-left font-mono text-[9px]">
          <TableHeader className="text-muted-foreground">
            <TableRow className="border-b border-border hover:bg-transparent">
              <TableHead className="h-auto w-14 px-3 py-1.5 font-medium text-muted-foreground">
                Method
              </TableHead>
              <TableHead className="h-auto px-2 py-1.5 font-medium text-muted-foreground">
                Path
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {routes.map((route) => {
              const highlighted =
                hovered?.kind === "file"
                  ? hovered.path === route.filePath
                  : hovered?.kind === "node" &&
                    graph.fileToNode[route.filePath] === hovered.id;
              return (
                <TableRow
                  className="border-b border-border last:border-b-0 hover:bg-transparent"
                  key={`${route.method}:${route.path}:${route.filePath}`}
                >
                  <TableCell className="px-3 py-2 align-top font-semibold text-accent">
                    {route.method}
                  </TableCell>
                  <TableCell className="p-0 whitespace-normal">
                    <button
                      className={`block w-full break-all px-2 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
                        highlighted ? "bg-surface-muted" : "hover:bg-surface-muted"
                      }`}
                      onClick={() => onSelectFile(route.filePath)}
                      onMouseEnter={() => onHover({ kind: "file", path: route.filePath })}
                      onMouseLeave={() => onHover(null)}
                      title={route.filePath}
                      type="button"
                    >
                      {route.path}
                    </button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
    </DetailSection>
  );
}

/** Show direct imports and importers, plus on-demand dependency walks within two levels. */
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
    <div className="pb-5">
      <div className="px-4 pb-3 pt-2">
        <button
          className="break-all text-left font-mono text-xs font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
          onClick={() => onSelectFile(file.path)}
          type="button"
        >
          {file.path}
        </button>
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Fact label="Kind" value={file.moduleKind.toUpperCase()} />
          <Fact label="Length" value={`${file.lineCount} lines`} />
        </div>
        <div className="mt-3 flex gap-4">
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

/** Render a traversal action with its pressed state and direction-specific color. */
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
      className={`border-b-2 border-transparent px-0 py-1.5 text-left text-[10px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
        active
          ? direction === "incoming"
            ? "border-imported-by text-imported-by"
            : "border-imports text-imports"
          : "text-muted-foreground hover:text-foreground"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

/** Render the four graph insight categories in an initially collapsed panel. */
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
    <Collapsible className="group/insights mt-4 border-t border-border pt-2">
      <CollapsibleTrigger className="flex w-full cursor-pointer items-center justify-between px-4 py-2 text-[10px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent">
        <span className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="w-2 font-mono text-muted-foreground group-data-[open]/insights:hidden"
          >
            +
          </span>
          <span
            aria-hidden="true"
            className="hidden w-2 font-mono text-muted-foreground group-data-[open]/insights:inline"
          >
            −
          </span>
          Insights
        </span>
        <span className="font-mono tabular-nums text-muted-foreground">{insightCount}</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
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
        <section className="pt-3">
          <p className="px-4 pb-1 text-[10px] leading-4 text-muted-foreground">
            {insightSentences.cycles}
          </p>
          {insights.cycles.length === 0 ? (
            <EmptyList>None found.</EmptyList>
          ) : (
            insights.cycles.map((cycle) => (
              <div key={cycle.join("\u0000")}>
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
      </CollapsibleContent>
    </Collapsible>
  );
}

/** Show one insight description with selectable file paths or an empty result. */
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
    <section className="pt-3">
      <p className="px-4 pb-1 text-[10px] leading-4 text-muted-foreground">{sentence}</p>
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
      <div className="px-4 pb-3 pt-2">
        <p className="break-all font-mono text-xs font-semibold">{node.id}</p>
        <p className="mt-1 text-xs text-muted-foreground">{node.files.length} files</p>
      </div>
      <DetailSection title="File kinds">
        {[...kindCounts.entries()]
          .toSorted((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
          .map(([kind, count]) => (
            <div
              className="flex items-center justify-between px-4 py-2 font-mono text-[10px]"
              key={kind}
            >
              <span>{kind.toUpperCase()}</span>
              <span className="tabular-nums text-muted-foreground">{count}</span>
            </div>
          ))}
      </DetailSection>
    </div>
  );
}

function DetailSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <section className="mx-3 mt-4 overflow-hidden rounded-md border border-border bg-surface [&>button+button]:border-t [&>button+button]:border-border">
      <h2 className="border-b border-border bg-surface-muted px-3 py-2 text-[10px] font-semibold text-foreground">
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
      className={`flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-[10px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
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
        <span className="shrink-0 tabular-nums text-muted-foreground" title={`${count} ${countLabel}`}>
          {count}
        </span>
      ) : null}
    </button>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="px-2 py-2.5 text-center">
      <p className="font-mono text-sm font-semibold tabular-nums leading-none">{value}</p>
      <p className="mt-1.5 text-[9px] text-muted-foreground">{label}</p>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] text-muted-foreground">{label}</p>
      <p className="mt-0.5 font-mono text-[10px]">{value}</p>
    </div>
  );
}

function EmptyList({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-2 text-[10px] text-muted-foreground">{children}</p>;
}

function findFile(graph: FoldedGraph, filePath: string): CanvasFile | null {
  const nodeId = graph.fileToNode[filePath];
  return graph.nodes.find((node) => node.id === nodeId)?.files.find(
    (file) => file.path === filePath,
  ) ?? null;
}

/** Render a folded module or its file panel, including category match counts and dimming. */
function ModuleNode({ data, selected }: NodeProps<ModuleFlowNode>) {
  const {
    folderNode,
    expanded,
    dimmed,
    selectedFile,
    hoveredFile,
    activeRole,
    roleColors,
    onClose,
    onHoverFile,
    onHoverNode,
    onSelectFile,
  } = data;
  const updateNodeInternals = useUpdateNodeInternals();
  const categoryMatchCount = activeRole
    ? folderNode.files.filter((file) => file.role === activeRole).length
    : null;

  if (!expanded) {
    return (
      <div
        className={`relative flex size-full flex-col justify-between rounded-md border bg-surface px-3 py-2 font-mono ${
          selected ? "border-accent" : "border-border"
        } ${
          dimmed ? "opacity-15" : "opacity-100"
        }`}
      >
        <Handle type="target" position={Position.Left} className="!size-1.5 !border-0 !bg-imported-by" />
        <div className="min-w-0">
          <p className="truncate text-[11px] font-semibold">{folderNode.label}</p>
          <p className="mt-0.5 text-[9px] text-muted-foreground">
            {categoryMatchCount === null
              ? `${folderNode.files.length} files`
              : `${categoryMatchCount} / ${folderNode.files.length} match`}
          </p>
        </div>
        <div className="flex items-center justify-between text-[8px] tabular-nums">
          <span
            className="text-imported-by"
            aria-label={`${folderNode.fanIn} incoming imports`}
            title={`${folderNode.fanIn} incoming imports`}
          >
            ← {folderNode.fanIn}
          </span>
          <span
            className="text-imports"
            aria-label={`${folderNode.fanOut} outgoing imports`}
            title={`${folderNode.fanOut} outgoing imports`}
          >
            {folderNode.fanOut} →
          </span>
        </div>
        <Handle type="source" position={Position.Right} className="!size-1.5 !border-0 !bg-imports" />
      </div>
    );
  }

  return (
    <div
      className={`relative flex size-full flex-col overflow-hidden rounded-md border bg-surface font-mono ${
        selected ? "border-accent" : "border-border"
      } ${
        dimmed ? "opacity-15" : "opacity-100"
      }`}
    >
      <Handle
        id="node-in"
        type="target"
        position={Position.Left}
        className="!top-6 !size-1.5 !border-0 !bg-imported-by"
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
          <span className="block text-[8px] text-muted-foreground">
            {categoryMatchCount === null
              ? `${folderNode.files.length} files`
              : `${categoryMatchCount} / ${folderNode.files.length} match`}
          </span>
        </span>
        <span className="flex shrink-0 gap-2 text-[8px] tabular-nums">
          <span
            className="text-imported-by"
            aria-label={`${folderNode.fanIn} incoming imports`}
            title={`${folderNode.fanIn} incoming imports`}
          >
            ← {folderNode.fanIn}
          </span>
          <span
            className="text-imports"
            aria-label={`${folderNode.fanOut} outgoing imports`}
            title={`${folderNode.fanOut} outgoing imports`}
          >
            {folderNode.fanOut} →
          </span>
        </span>
      </button>
      <Handle
        id="node-out"
        type="source"
        position={Position.Right}
        className="!top-6 !size-1.5 !border-0 !bg-imports"
      />

      <div
        className="tool-scrollbar nodrag nopan nowheel min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-contain"
        onScroll={() => updateNodeInternals(folderNode.id)}
      >
        {folderNode.files.map((file) => (
          <FileRow
            file={file}
            color={roleColors[file.role] ?? "var(--muted-foreground)"}
            key={file.path}
            selected={selectedFile === file.path}
            hovered={hoveredFile === file.path}
            dimmed={
              activeRole !== null && file.role !== activeRole
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

/** Render a selectable file with dependency handles, hover feedback, and category dimming. */
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
      className={`relative h-6 ${
        dimmed ? "opacity-15" : ""
      }`}
    >
      <Handle
        id={`in:${file.path}`}
        type="target"
        position={Position.Left}
        className="!size-1 !border-0 !bg-imported-by"
      />
      <button
        type="button"
        className={`nodrag flex size-full items-center gap-2 px-3 text-left text-[9px] focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent ${
          selected
            ? "bg-accent text-accent-foreground"
            : hovered
              ? "bg-surface-muted outline outline-1 outline-accent"
              : "hover:bg-surface-muted hover:outline hover:outline-1 hover:outline-accent"
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
          className={selected ? "text-accent-foreground/70" : "text-imported-by"}
          title={`${file.fanIn} incoming imports`}
        >
          ← {file.fanIn}
        </span>
        <span
          className={selected ? "text-accent-foreground/70" : "text-imports"}
          title={`${file.fanOut} outgoing imports`}
        >
          {file.fanOut} →
        </span>
      </button>
      <Handle
        id={`out:${file.path}`}
        type="source"
        position={Position.Right}
        className="!size-1 !border-0 !bg-imports"
      />
    </div>
  );
}

function fileName(filePath: string): string {
  return filePath.split("/").at(-1) ?? filePath;
}

/** Fan adjacent edges into stable, distinct curves without introducing motion. */
function edgeCurvature(edgeId: string, sameFolder: boolean): number {
  let hash = 0;
  for (const character of edgeId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return sameFolder ? 0.85 + (hash % 3) * 0.12 : 0.32 + (hash % 5) * 0.06;
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

/** Return whether any source or target file represented by an edge matches the role. */
function edgeMatchesRole(
  graph: FoldedGraph,
  edge: DependencyFlowEdge,
  role: string,
): boolean {
  return [...(edge.data?.sourcePaths ?? []), ...(edge.data?.targetPaths ?? [])].some(
    (path) => findFile(graph, path)?.role === role,
  );
}
