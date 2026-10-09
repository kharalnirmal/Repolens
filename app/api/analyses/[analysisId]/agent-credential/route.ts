import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

import { mintAnalysisCredential } from "@/lib/agent/analysis-credential";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ analysisId: string }> },
) {
  const authentication = await auth();
  if (!authentication.userId || !authentication.orgId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { analysisId } = await params;
  const supabase = createServerSupabaseClient(authentication.getToken);
  const { data: analysis, error } = await supabase
    .from("analyses")
    .select("id, organization_id, project_id, status")
    .eq("id", analysisId)
    .maybeSingle();

  if (error) {
    console.error("Could not authorize agent analysis", error);
    return NextResponse.json({ error: "Could not authorize analysis" }, { status: 500 });
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

  return NextResponse.json(
    mintAnalysisCredential({
      analysisId: analysis.id,
      organizationId: analysis.organization_id,
      projectId: analysis.project_id,
      accessToken,
    }),
    {
      headers: {
        "cache-control": "no-store",
      },
    },
  );
}
