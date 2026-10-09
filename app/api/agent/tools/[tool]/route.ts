import { NextResponse } from "next/server";

import { verifyAnalysisCredential } from "@/lib/agent/analysis-credential";
import {
  isRepositoryToolName,
  runRepositoryTool,
  ToolInputError,
} from "@/lib/agent/repository-tools";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ tool: string }> },
) {
  const { tool } = await params;
  if (!isRepositoryToolName(tool)) {
    return NextResponse.json({ error: "Tool not found" }, { status: 404 });
  }

  const credential = readBearerToken(request.headers.get("authorization"));
  if (!credential) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let verified;
  try {
    verified = verifyAnalysisCredential(credential);
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let input: unknown;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const supabase = createServerSupabaseClient(async () => verified.accessToken);
    const result = await runRepositoryTool(
      supabase,
      verified.analysisId,
      tool,
      input,
    );
    return NextResponse.json(result, {
      headers: {
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    if (error instanceof ToolInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Agent repository tool failed", { tool, error });
    return NextResponse.json({ error: "Tool lookup failed" }, { status: 500 });
  }
}

function readBearerToken(authorization: string | null): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}
