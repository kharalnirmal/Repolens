import { auth } from "@clerk/nextjs/server";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

import { rerunAnalysis } from "@/app/actions";
import { AnalysisCanvas } from "@/components/analysis-canvas";
import { AnalysisProgress } from "@/components/analysis-progress";
import { Button } from "@/components/ui/button";
import { WorkspaceHeader } from "@/components/workspace-header";
import { loadAnalysisGraph } from "@/lib/analysis/load-analysis-graph";
import { tracingConfigured } from "@/lib/ai/client";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const maxDuration = 300;

export default async function AnalysisPage({
  params,
}: {
  params: Promise<{ analysisId: string }>;
}) {
  await auth.protect();
  const authentication = await auth();
  const { analysisId } = await params;
  const supabase = createServerSupabaseClient(authentication.getToken);
  const { data: analysis, error } = await supabase
    .from("analyses")
    .select(
      `
        id,
        status,
        stage,
        status_message,
        error_message,
        commit_sha,
        project:projects!analyses_organization_id_project_id_fkey (
          repository_name,
          repository_url
        )
      `,
    )
    .eq("id", analysisId)
    .maybeSingle();

  if (error) throw new Error(`Could not load analysis: ${error.message}`);
  if (!analysis) notFound();

  if (analysis.status === "completed") {
    const graph = await loadAnalysisGraph(supabase, analysis.id);
    return (
      <AnalysisCanvas
        {...graph}
        analysisId={analysis.id}
        tracingConfigured={tracingConfigured}
      />
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <WorkspaceHeader projectName={analysis.project.repository_name} />

      <main className="flex flex-1 flex-col">
        <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
          <Link
            href="/"
            className="mb-8 inline-flex h-9 w-fit items-center gap-2 rounded-md border border-border bg-background px-3 text-sm font-semibold outline-none hover:bg-surface-muted focus-visible:ring-2 focus-visible:ring-imports focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            All analyses
          </Link>
          <div className="mb-8">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="truncate font-heading text-2xl font-semibold tracking-[-0.04em]">
                  {analysis.project.repository_name}
                </h1>
                <p className="mt-2 truncate font-mono text-xs text-muted-foreground">
                  {analysis.project.repository_url}
                </p>
              </div>
              <span className="pt-1 text-sm font-semibold capitalize text-muted-foreground">{analysis.status}</span>
            </div>
            {analysis.commit_sha ? (
              <p className="mt-3 font-mono text-[10px] text-muted-foreground">
                commit {analysis.commit_sha}
              </p>
            ) : null}
          </div>

          <AnalysisProgress
            analysisId={analysis.id}
            initialProgress={{
              status: analysis.status,
              stage: analysis.stage,
              message: analysis.status_message,
              error: analysis.error_message,
            }}
          />

          <div className="mt-6 flex items-center justify-end text-sm text-muted-foreground">
            {analysis.status === "failed" ? (
              <form action={rerunAnalysis}>
                <input name="analysisId" type="hidden" value={analysis.id} />
                <Button
                  size="sm"
                  className="h-9 rounded-md border border-foreground bg-foreground px-4 text-sm font-semibold text-surface hover:border-accent hover:bg-accent"
                  type="submit"
                >
                  Run again
                </Button>
              </form>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
