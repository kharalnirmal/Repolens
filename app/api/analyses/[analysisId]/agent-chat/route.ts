import { auth } from "@clerk/nextjs/server";
import { Client } from "@langchain/langgraph-sdk";
import { NextResponse } from "next/server";

import { mintAnalysisCredential } from "@/lib/agent/analysis-credential";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 300;

// The assistant id is the agent project's name, which MDA publishes as the
// deployment's assistant. The analysis credential travels as run context, so
// the relay uses the SDK's runs stream (whose payload carries context) rather
// than the thread-stream run entry point (whose params have no context field).
const agentAssistantId = "repolens-agent";
const maxQuestionLength = 4000;
const maxArgSummaryLength = 300;
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  { params }: { params: Promise<{ analysisId: string }> },
) {
  const authentication = await auth();
  if (!authentication.userId || !authentication.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const { message, selectedPath, threadId } = readChatRequest(body);
  if (!message) {
    return NextResponse.json(
      { error: "message must be a non-empty string" },
      { status: 400 },
    );
  }

  const agentUrl = process.env.REPOLENS_AGENT_URL?.trim();
  const agentApiKey = process.env.LANGSMITH_API_KEY?.trim();
  if (!agentUrl || !agentApiKey) {
    return NextResponse.json(
      { error: "Agent is not configured" },
      { status: 503 },
    );
  }

  const { analysisId } = await params;
  const supabase = createServerSupabaseClient(authentication.getToken);
  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("id, organization_id, project_id, status")
    .eq("id", analysisId)
    .maybeSingle();

  if (error) {
    console.error("Could not authorize agent chat", error);
    return NextResponse.json(
      { error: "Could not authorize analysis" },
      { status: 500 },
    );
  }
  if (!analysis || analysis.organization_id !== authentication.orgId) {
    return NextResponse.json({ error: "Analysis not found" }, { status: 404 });
  }
  if (analysis.status !== "completed") {
    return NextResponse.json(
      { error: "Analysis is not complete" },
      { status: 409 },
    );
  }

  const accessToken = await authentication.getToken();
  if (!accessToken) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = new Client({ apiUrl: agentUrl, apiKey: agentApiKey });
  const threadMetadata = {
    repolens_analysis_id: analysis.id,
    repolens_organization_id: authentication.orgId,
    repolens_user_id: authentication.userId,
  };
  let resolvedThreadId = threadId;
  if (resolvedThreadId) {
    let existingThread;
    try {
      existingThread = await client.threads.get(resolvedThreadId);
    } catch {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
    const metadata =
      (existingThread.metadata ?? {}) as Record<string, unknown>;
    if (
      metadata.repolens_analysis_id !== threadMetadata.repolens_analysis_id ||
      metadata.repolens_organization_id !==
        threadMetadata.repolens_organization_id ||
      metadata.repolens_user_id !== threadMetadata.repolens_user_id
    ) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }
  } else {
    try {
      const thread = await client.threads.create({
        metadata: threadMetadata,
      });
      resolvedThreadId = thread.thread_id;
    } catch (streamError) {
      console.error("Agent is unreachable", streamError);
      return NextResponse.json(
        { error: "Agent is unreachable right now" },
        { status: 502 },
      );
    }
  }

  // The credential is minted and consumed server-side; the browser only ever
  // sees the thread id. The agent learns the analysis solely from the context.
  const { credential } = mintAnalysisCredential({
    analysisId: analysis.id,
    organizationId: analysis.organization_id,
    projectId: analysis.project_id,
    accessToken,
  });
  const content = selectedPath
    ? `Selected file: ${selectedPath}\n\n${message}`
    : message;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          new TextEncoder().encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };
      const seenToolCalls = new Set<string>();
      try {
        send("thread", { threadId: resolvedThreadId });
        // "messages-tuple" yields per-token message deltas; the "messages"
        // mode yields cumulative partials that would repeat tokens.
        const run = client.runs.stream(resolvedThreadId, agentAssistantId, {
          input: { messages: [{ role: "user", content }] },
          context: { analysisCredential: credential },
          streamMode: ["updates", "messages-tuple"],
          signal: request.signal,
        });
        for await (const chunk of run) {
          if (chunk.event === "error") {
            throw new Error(readAgentError(chunk.data));
          } else if (chunk.event === "updates") {
            for (const call of readToolCalls(chunk.data)) {
              if (seenToolCalls.has(call.id)) continue;
              seenToolCalls.add(call.id);
              send("tool_call", {
                id: call.id,
                name: call.name,
                detail: summarizeArgs(call.args),
              });
            }
          } else if (chunk.event === "messages") {
            const text = readTokenText(chunk.data);
            if (text) send("token", { text });
          }
        }
        send("done", {});
        controller.close();
      } catch (streamError) {
        if (request.signal.aborted) return;
        console.error("Agent run failed", streamError);
        try {
          send("error", {
            message: "Agent response stopped before it finished",
          });
        } catch {
          // The stream is already cancelled; nothing left to report.
        }
        try {
          controller.close();
        } catch {
          // The stream is already cancelled; closing again would throw.
        }
      }
    },
    cancel() {
      // Closing the browser connection aborts the SDK request via the signal.
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
    },
  });
}

function readChatRequest(body: unknown): {
  message: string | null;
  selectedPath: string | null;
  threadId: string | null;
} {
  if (!isRecord(body)) return { message: null, selectedPath: null, threadId: null };
  const message =
    typeof body.message === "string" && body.message.trim().length > 0
      ? body.message.trim().slice(0, maxQuestionLength)
      : null;
  const selectedPath =
    typeof body.selectedPath === "string" && body.selectedPath.trim().length > 0
      ? body.selectedPath.trim().slice(0, 500)
      : null;
  const threadId =
    typeof body.threadId === "string" && uuidPattern.test(body.threadId)
      ? body.threadId
      : null;
  return { message, selectedPath, threadId };
}

function readToolCalls(data: unknown): Array<{
  id: string;
  name: string;
  args: Record<string, unknown>;
}> {
  if (!isRecord(data)) return [];
  const calls: Array<{ id: string; name: string; args: Record<string, unknown> }> = [];
  for (const nodeValue of Object.values(data)) {
    if (!isRecord(nodeValue) || !Array.isArray(nodeValue.messages)) continue;
    for (const message of nodeValue.messages) {
      if (!isRecord(message) || !Array.isArray(message.tool_calls)) continue;
      for (const call of message.tool_calls) {
        if (!isRecord(call)) continue;
        if (typeof call.id !== "string" || typeof call.name !== "string") {
          continue;
        }
        calls.push({
          id: call.id,
          name: call.name,
          args: isRecord(call.args) ? call.args : {},
        });
      }
    }
  }
  return calls;
}

function readTokenText(data: unknown): string | null {
  if (!Array.isArray(data) || data.length === 0) return null;
  const chunk = data[0];
  if (!isRecord(chunk) || chunk.type !== "ai") return null;
  if (typeof chunk.content === "string") return chunk.content || null;
  if (!Array.isArray(chunk.content)) return null;
  let text = "";
  for (const part of chunk.content) {
    if (isRecord(part) && part.type === "text" && typeof part.text === "string") {
      text += part.text;
    }
  }
  return text || null;
}

function readAgentError(data: unknown): string {
  if (!isRecord(data)) return "Agent run failed";
  if (typeof data.message === "string" && data.message.trim()) {
    return data.message;
  }
  if (typeof data.error === "string" && data.error.trim()) {
    return data.error;
  }
  return "Agent run failed";
}

function summarizeArgs(args: Record<string, unknown>): string {
  const summary = JSON.stringify(args);
  return summary.length > maxArgSummaryLength
    ? `${summary.slice(0, maxArgSummaryLength)}…`
    : summary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
