import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import {
  ChatRequestError,
  readChatRequest,
} from "@/lib/agent/chat-request";
import {
  createRepositoryAgent,
  isEmbeddedRepositoryToolName,
} from "@/lib/agent/embedded-agent";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 300;

const maxArgSummaryLength = 300;
const agentRecursionLimit = 20;

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

  let chatRequest;
  try {
    chatRequest = readChatRequest(body);
  } catch (error) {
    if (error instanceof ChatRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
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

  // Tool closures are created only after RLS and the explicit tenant check have
  // authorized this exact analysis. The model never receives tenant selectors.
  const agent = createRepositoryAgent(supabase, analysis.id);
  const content = chatRequest.selectedPath
    ? `Selected file: ${chatRequest.selectedPath}\n\n${chatRequest.message}`
    : chatRequest.message;
  const messages = [
    ...chatRequest.history.map(({ role, text }) => ({ role, content: text })),
    { role: "user" as const, content },
  ];

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          new TextEncoder().encode(
            `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`,
          ),
        );
      };
      let completedRepositoryTool = false;

      try {
        const events = agent.streamEvents(
          { messages },
          {
            version: "v2",
            recursionLimit: agentRecursionLimit,
            signal: request.signal,
          },
        );

        for await (const event of events) {
          if (
            event.event === "on_tool_start" &&
            isEmbeddedRepositoryToolName(event.name)
          ) {
            send("tool_call", {
              id: event.run_id,
              name: event.name,
              detail: summarizeArgs(event.data.input),
            });
          } else if (
            event.event === "on_tool_end" &&
            isEmbeddedRepositoryToolName(event.name)
          ) {
            completedRepositoryTool = true;
          } else if (event.event === "on_chat_model_stream") {
            const text = readTokenText(event.data.chunk);
            if (text && completedRepositoryTool) send("token", { text });
          }
        }

        if (!completedRepositoryTool) {
          throw new Error("Agent completed without repository evidence");
        }
        send("done", {});
        controller.close();
      } catch (streamError) {
        if (request.signal.aborted) {
          try {
            controller.close();
          } catch {
            // The browser already closed the response stream.
          }
          return;
        }
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
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
    },
  });
}

function readTokenText(value: unknown): string | null {
  if (!isRecord(value)) return null;
  if (typeof value.content === "string") return value.content || null;
  if (!Array.isArray(value.content)) return null;

  let text = "";
  for (const part of value.content) {
    if (isRecord(part) && part.type === "text" && typeof part.text === "string") {
      text += part.text;
    }
  }
  return text || null;
}

function summarizeArgs(value: unknown): string {
  const summary = JSON.stringify(isRecord(value) ? value : {});
  return summary.length > maxArgSummaryLength
    ? `${summary.slice(0, maxArgSummaryLength)}...`
    : summary;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
