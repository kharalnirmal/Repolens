import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { notFound } from "next/navigation";

import { rerunAnalysis } from "@/app/actions";
import { AnalysisCanvas } from "@/components/analysis-canvas";
import { AnalysisProgress } from "@/components/analysis-progress";
import { ThemeControl } from "@/components/theme-control";
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
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-border bg-surface px-3 py-2 sm:px-5">
        <Link href="/" className="flex min-w-0 items-center gap-2.5 outline-none focus-visible:text-accent">
          <span className="grid size-7 shrink-0 place-items-center border border-foreground bg-foreground font-mono text-[9px] font-bold tracking-[-0.08em] text-surface">
            RL
          </span>
          <span className="font-mono text-[13px] font-semibold tracking-[-0.03em]">
            RepoLens
          </span>
        </Link>
        <span className="hidden h-4 w-px bg-border sm:block" />
        <OrganizationSwitcher
          hidePersonal
          afterCreateOrganizationUrl="/"
          afterSelectOrganizationUrl="/"
          afterLeaveOrganizationUrl="/"
        />
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeControl />
          <UserButton />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <div className="flex h-9 items-center border-b border-border bg-surface-muted px-3 font-mono text-[10px] text-muted sm:px-5">
          <Link href="/" className="hover:text-accent">workspace</Link>
          <span className="mx-2 text-border">/</span>
          <span className="truncate text-foreground">{analysis.project.repository_name}</span>
        </div>

        <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-3 py-6 sm:px-5 sm:py-10">
          <div className="mb-6 border-l-2 border-accent pl-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate font-mono text-base font-semibold sm:text-lg">
                  {analysis.project.repository_name}
                </h1>
                <p className="mt-1 truncate font-mono text-[10px] text-muted">
                  {analysis.project.repository_url}
                </p>
              </div>
              <span className="border border-border bg-surface px-2 py-1 font-mono text-[9px] text-muted">
                {analysis.status}
              </span>
            </div>
            {analysis.commit_sha ? (
              <p className="mt-3 font-mono text-[9px] text-muted">
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

          <div className="mt-4 flex items-center justify-between font-mono text-[10px] text-muted">
            <Link href="/" className="hover:text-accent">Back to dashboard</Link>
            {analysis.status === "failed" ? (
              <form action={rerunAnalysis}>
                <input name="analysisId" type="hidden" value={analysis.id} />
                <button
                  className="border border-foreground bg-foreground px-3 py-1.5 font-mono text-[10px] font-semibold text-surface hover:border-accent hover:bg-accent"
                  type="submit"
                >
                  Run again
                </button>
              </form>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
