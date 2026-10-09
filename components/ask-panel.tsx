"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  GitBranch,
  LoaderCircle,
  MessageSquareText,
  RotateCcw,
} from "lucide-react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface AskPanelProps {
  analysisId: string;
  selectedPath: string | null;
  knownPaths: Readonly<Record<string, string>>;
  onSelectFile: (path: string) => void;
}

interface ToolStep {
  id: string;
  name: string;
  detail: string;
}

interface Turn {
  id: number;
  role: "user" | "assistant";
  text: string;
  tools: ToolStep[];
  pending: boolean;
  error: string | null;
}

export function AskPanel({
  analysisId,
  selectedPath,
  knownPaths,
  onSelectFile,
}: AskPanelProps) {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const nextId = useRef(1);
  const abort = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const stickToBottom = useRef(true);

  useEffect(() => {
    const panel = scrollRef.current;
    if (panel && stickToBottom.current) {
      panel.scrollTop = panel.scrollHeight;
    }
  }, [turns]);

  useEffect(() => () => abort.current?.abort(), []);

  const starterQuestions = selectedPath
    ? ["What depends on this file?", "What does this file import?"]
    : ["Where is authentication handled?", "Show me the recovered routes"];

  const ask = async (question: string) => {
    const userId = nextId.current++;
    const assistantId = nextId.current++;
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setSending(true);
    setTurns((current) => [
      ...current,
      { id: userId, role: "user", text: question, tools: [], pending: false, error: null },
      { id: assistantId, role: "assistant", text: "", tools: [], pending: true, error: null },
    ]);
    const patchAssistant = (patch: (turn: Turn) => Turn) => {
      setTurns((current) =>
        current.map((turn) => (turn.id === assistantId ? patch(turn) : turn)),
      );
    };

    try {
      const response = await fetch(`/api/analyses/${analysisId}/agent-chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ message: question, selectedPath, threadId }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const message = await readErrorMessage(response);
        patchAssistant((turn) => ({ ...turn, pending: false, error: message }));
        return;
      }
      await readAgentStream(response.body, {
        onThread: (id) => setThreadId(id),
        onToolCall: (step) =>
          patchAssistant((turn) => ({ ...turn, tools: [...turn.tools, step] })),
        onToken: (text) =>
          patchAssistant((turn) => ({ ...turn, text: turn.text + text })),
        onError: (message) =>
          patchAssistant((turn) => ({ ...turn, pending: false, error: message })),
      });
      patchAssistant((turn) => ({ ...turn, pending: false }));
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error("Ask failed", error);
      patchAssistant((turn) => ({
        ...turn,
        pending: false,
        error: "Agent is unreachable right now",
      }));
    } finally {
      if (abort.current === controller) abort.current = null;
      setSending(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-border px-4">
        <span className="flex items-center gap-2 text-[11px] font-semibold">
          <span className="grid size-5 place-items-center rounded-sm bg-surface-muted text-imports">
            <GitBranch aria-hidden="true" className="size-3" />
          </span>
          Evidence-backed answers
        </span>
        {turns.length > 0 ? (
          <Button
            className="h-6 rounded-sm px-2 text-[9px] text-muted-foreground transition-none hover:text-foreground disabled:pointer-events-auto disabled:cursor-wait disabled:opacity-100"
            disabled={sending}
            onClick={() => {
              setTurns([]);
              setThreadId(null);
            }}
            size="xs"
            type="button"
            variant="ghost"
          >
            <RotateCcw aria-hidden="true" className="size-2.5" />
            Clear
          </Button>
        ) : null}
      </div>
      <div
        aria-busy={sending}
        aria-live="polite"
        className="tool-scrollbar min-h-0 flex-1 overflow-y-auto"
        onScroll={(event) => {
          const panel = event.currentTarget;
          stickToBottom.current =
            panel.scrollHeight - panel.scrollTop - panel.clientHeight < 48;
        }}
        ref={scrollRef}
      >
        {turns.length === 0 ? (
          <div className="px-4 py-6">
            <div className="grid size-8 place-items-center rounded-md border border-border bg-surface-muted text-imports">
              <MessageSquareText aria-hidden="true" className="size-4" />
            </div>
            <div className="mt-3">
              <p className="text-xs font-semibold tracking-[-0.02em]">
                Ask the dependency map
              </p>
              <p className="mt-1 max-w-[30ch] text-[11px] leading-5 text-muted-foreground">
                Trace ownership, imports, routes, and change impact. Answers cite the
                map lookups they use.
              </p>
            </div>
            <div className="mt-6">
              <p className="mb-2 text-[10px] text-muted-foreground">Try a repository question</p>
              <div className="grid gap-1.5">
                {starterQuestions.map((question) => (
                  <Button
                    className="h-auto min-h-9 w-full justify-start whitespace-normal rounded-md px-3 py-2 text-left text-[10px] font-medium leading-4 transition-none"
                    disabled={sending}
                    key={question}
                    onClick={() => {
                      stickToBottom.current = true;
                      void ask(question);
                    }}
                    size="sm"
                    type="button"
                    variant="outline"
                  >
                    {question}
                  </Button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div>
            {turns.map((turn) =>
              turn.role === "user" ? (
                <article className="border-b border-border bg-surface-muted px-4 py-3" key={turn.id}>
                  <p className="text-[9px] font-medium text-muted-foreground">You</p>
                  <p className="mt-1 text-[11px] font-medium leading-5">{turn.text}</p>
                </article>
              ) : (
                <article className="border-b border-border px-4 py-4 last:border-b-0" key={turn.id}>
                  <p className="flex items-center gap-1.5 text-[10px] font-semibold">
                    <GitBranch aria-hidden="true" className="size-3 text-imports" />
                    RepoLens
                  </p>
                  {turn.tools.length > 0 ? (
                    <div className="mt-2">
                      <p className="text-[8px] text-muted-foreground">
                        {turn.pending ? "Checking the map" : "Map evidence"}
                      </p>
                      <ol className="ml-1 mt-1.5 border-l border-border">
                        {turn.tools.map((step) => {
                          const description = describeToolStep(step);
                          return (
                            <li className="relative py-1 pl-3" key={step.id}>
                              <span
                                aria-hidden="true"
                                className="absolute -left-[3px] top-[9px] size-[5px] bg-accent"
                              />
                              <p className="text-[9px] font-medium leading-3.5">
                                {description.label}
                              </p>
                              {description.detail ? (
                                <p
                                  className="mt-0.5 truncate font-mono text-[8px] leading-3.5 text-muted-foreground"
                                  title={description.detail}
                                >
                                  {description.detail}
                                </p>
                              ) : null}
                            </li>
                          );
                        })}
                      </ol>
                    </div>
                  ) : null}
                  {turn.text ? (
                    <div className="mt-3">
                      <AnswerText
                        knownPaths={knownPaths}
                        onSelectFile={onSelectFile}
                        text={turn.text}
                      />
                    </div>
                  ) : turn.pending ? (
                    <p className="mt-2 text-[9px] leading-4 text-muted-foreground">
                      {turn.tools.length > 0
                        ? "Building an answer from these results…"
                        : "Choosing a lookup…"}
                    </p>
                  ) : null}
                  {!turn.pending &&
                  !turn.error &&
                  turn.text &&
                  turn.tools.length === 0 ? (
                    <p className="mt-2 text-[9px] leading-4 text-muted-foreground">
                      Answered without a repository lookup.
                    </p>
                  ) : null}
                  {turn.error ? (
                    <Alert className="mt-2 rounded-md bg-surface-muted p-2 text-[10px] leading-4">
                      <p>{turn.error}</p>
                      <p className="mt-1 text-muted-foreground">
                        Try again. The repository map is still available.
                      </p>
                    </Alert>
                  ) : null}
                </article>
              ),
            )}
          </div>
        )}
      </div>
      <form
        className="shrink-0 border-t border-border bg-surface p-3"
        onSubmit={(event) => {
          event.preventDefault();
          const question = draft.trim();
          if (!question || sending) return;
          setDraft("");
          stickToBottom.current = true;
          void ask(question);
        }}
      >
        {selectedPath ? (
          <Badge className="mb-2 flex h-6 max-w-full justify-start rounded-sm px-2 font-normal" variant="secondary">
            <span className="shrink-0 text-[8px] text-muted-foreground">Context</span>
            <span className="truncate font-mono text-[8px]" title={selectedPath}>
              {selectedPath}
            </span>
          </Badge>
        ) : null}
        <div className="rounded-md border border-border bg-background focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30">
          <Textarea
            aria-label="Ask about this repository"
            className="field-sizing-fixed max-h-28 min-h-16 w-full resize-none rounded-none border-0 bg-transparent px-3 py-2 text-[11px] leading-5 shadow-none transition-none placeholder:text-muted-foreground focus-visible:border-0 focus-visible:ring-0 dark:bg-transparent"
            disabled={sending}
            maxLength={4000}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (
                event.key !== "Enter" ||
                event.shiftKey ||
                event.nativeEvent.isComposing
              ) {
                return;
              }
              event.preventDefault();
              const question = draft.trim();
              if (!question || sending) return;
              setDraft("");
              stickToBottom.current = true;
              void ask(question);
            }}
            placeholder={
              sending ? "Waiting for the agent…" : "Ask about structure or change impact"
            }
            rows={2}
            value={draft}
          />
          <div className="flex items-center justify-between gap-2 px-2 pb-2">
            <span className="pl-1 text-[8px] text-muted-foreground">
              Enter to ask · Shift+Enter for a new line
            </span>
          <Button
            aria-label={sending ? "Asking repository" : "Ask repository"}
            className="size-7 shrink-0 rounded-md transition-none disabled:pointer-events-auto disabled:cursor-wait disabled:opacity-50"
            disabled={sending || !draft.trim()}
            size="icon-sm"
            type="submit"
          >
            {sending ? (
              <LoaderCircle aria-hidden="true" className="size-3 animate-spin" />
            ) : (
              <ArrowUp aria-hidden="true" className="size-3" />
            )}
          </Button>
          </div>
        </div>
      </form>
    </div>
  );
}

function describeToolStep(step: ToolStep): { label: string; detail: string | null } {
  let args: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(step.detail);
    if (isRecord(parsed)) args = parsed;
  } catch {
    return { label: step.name, detail: step.detail || null };
  }

  const filePath = typeof args.filePath === "string" ? args.filePath : null;
  switch (step.name) {
    case "get_analysis_summary":
      return { label: "Repository summary", detail: null };
    case "search_files":
      return {
        label: "File search",
        detail: typeof args.pathFragment === "string" ? args.pathFragment : null,
      };
    case "list_files_by_role":
      return {
        label: "Files by role",
        detail: typeof args.role === "string" ? args.role : null,
      };
    case "get_file_neighbors":
      return { label: "Direct relationships", detail: filePath };
    case "walk_dependencies": {
      const incoming = args.direction === "incoming";
      const depth = typeof args.depth === "number" ? args.depth : null;
      return {
        label: incoming ? "Importer walk" : "Dependency walk",
        detail: filePath
          ? `${filePath}${depth === null ? "" : ` (depth ${depth})`}`
          : null,
      };
    }
    case "get_route_table":
      return { label: "Recovered routes", detail: null };
    default:
      return { label: step.name, detail: step.detail || null };
  }
}

async function readAgentStream(
  body: ReadableStream<Uint8Array>,
  handlers: {
    onThread: (threadId: string) => void;
    onToolCall: (step: ToolStep) => void;
    onToken: (text: string) => void;
    onError: (message: string) => void;
  },
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const frames = buffer.split("\n\n");
    buffer = frames.pop() ?? "";
    for (const frame of frames) dispatchFrame(frame, handlers);
  }
  buffer += decoder.decode();
  if (buffer.trim()) dispatchFrame(buffer, handlers);
}

function dispatchFrame(
  frame: string,
  handlers: {
    onThread: (threadId: string) => void;
    onToolCall: (step: ToolStep) => void;
    onToken: (text: string) => void;
    onError: (message: string) => void;
  },
): void {
  let event: string | null = null;
  let payload: string | null = null;
  for (const line of frame.split("\n")) {
    if (line.startsWith("event:")) event = line.slice("event:".length).trim();
    else if (line.startsWith("data:")) payload = line.slice("data:".length).trim();
  }
  if (!event || !payload) return;
  let data: unknown;
  try {
    data = JSON.parse(payload);
  } catch {
    return;
  }
  if (!isRecord(data)) return;
  if (event === "thread" && typeof data.threadId === "string") {
    handlers.onThread(data.threadId);
  } else if (
    event === "tool_call" &&
    typeof data.id === "string" &&
    typeof data.name === "string" &&
    typeof data.detail === "string"
  ) {
    handlers.onToolCall({ id: data.id, name: data.name, detail: data.detail });
  } else if (event === "token" && typeof data.text === "string") {
    handlers.onToken(data.text);
  } else if (event === "error" && typeof data.message === "string") {
    handlers.onError(data.message);
  }
}

async function readErrorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    if (isRecord(data) && typeof data.error === "string") return data.error;
  } catch {
    // Fall through to the default below.
  }
  return "Agent is unreachable right now";
}

function AnswerText({
  text,
  knownPaths,
  onSelectFile,
}: {
  text: string;
  knownPaths: Readonly<Record<string, string>>;
  onSelectFile: (path: string) => void;
}) {
  const blocks = text.trim().split(/\n\s*\n/u);
  return (
    <div className="space-y-2 text-[10px] leading-[1.55]">
      {blocks.map((block, blockIndex) => {
        const lines = block.split("\n").map((line) => line.replace(/^#{1,6}\s*/u, ""));
        if (lines.every((line) => /^[-*]\s+/u.test(line))) {
          return (
            <ul className="space-y-1 pl-3" key={blockIndex}>
              {lines.map((line, lineIndex) => (
                <li
                  className="relative before:absolute before:-left-3 before:text-muted-foreground before:content-['-']"
                  key={lineIndex}
                >
                  {renderAnswerInline(line.replace(/^[-*]\s+/u, ""), knownPaths, onSelectFile)}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={blockIndex}>
            {renderAnswerInline(lines.join(" "), knownPaths, onSelectFile)}
          </p>
        );
      })}
    </div>
  );
}

function renderAnswerInline(
  text: string,
  knownPaths: Readonly<Record<string, string>>,
  onSelectFile: (path: string) => void,
): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  text
    .split(/(`[^`]*`|\*\*[^*]+\*\*)/u)
    .filter(Boolean)
    .forEach((part, index) => {
      if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
        const path = part.slice(1, -1).trim();
        if (Object.hasOwn(knownPaths, path)) {
          nodes.push(
            <button
              className="font-mono text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
              key={index}
              onClick={() => onSelectFile(path)}
              type="button"
            >
              {path}
            </button>,
          );
        } else {
          nodes.push(
            <code className="bg-surface-muted px-1 font-mono" key={index}>
              {path}
            </code>,
          );
        }
      } else if (part.startsWith("**") && part.endsWith("**")) {
        nodes.push(<strong key={index}>{part.slice(2, -2)}</strong>);
      } else {
        nodes.push(part.replace(/[*#]/gu, ""));
      }
    });
  return nodes;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
