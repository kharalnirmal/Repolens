import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { AnalysisRealtimeRefresh } from "@/components/analysis-realtime-refresh";
import { DeleteRepositoryButton } from "@/components/delete-repository-button";
import { LandingPage } from "@/components/landing-page";
import { RepositoryForm } from "@/components/repository-form";
import { WorkspaceHeader } from "@/components/workspace-header";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export const maxDuration = 300;

function statusMarker(status: string) {
  if (status === "completed") return "bg-emerald-500";
  if (status === "failed") return "bg-red-500";
  return "bg-border";
}

export default async function RootPage() {
  const authentication = await auth();

  if (!authentication.userId) {
    return <LandingPage />;
  }

  return <WorkspacePage />;
}

async function WorkspacePage() {
  await auth.protect();
  const authentication = await auth();

  const supabase = createServerSupabaseClient(authentication.getToken);
  const { data: analyses, error } = await supabase
    .from("analyses")
    .select(
      `
        id,
        status,
        stage,
        status_message,
        created_at,
        project:projects!analyses_organization_id_project_id_fkey (
          id,
          repository_name,
          repository_url
        )
      `,
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Could not load analyses: ${error.message}`);
  }

  const completedCount = analyses.filter(
    (analysis) => analysis.status === "completed",
  ).length;
  const activeCount = analyses.filter(
    (analysis) =>
      analysis.status === "queued" || analysis.status === "running",
  ).length;
  const failedCount = analyses.filter(
    (analysis) => analysis.status === "failed",
  ).length;

  const summary = [
    { label: "All runs", value: analyses.length },
    { label: "Completed", value: completedCount },
    { label: "In progress", value: activeCount },
    { label: "Failed", value: failedCount },
  ];
  const activeAnalysisIds = analyses
    .filter((analysis) => analysis.status === "queued" || analysis.status === "running")
    .map((analysis) => analysis.id);
  const canDeleteRepositories = authentication.has({ role: "org:admin" });

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <WorkspaceHeader />

      <main className="flex flex-1 flex-col">
        <AnalysisRealtimeRefresh analysisIds={activeAnalysisIds} />

        <section className="mx-auto flex w-full max-w-[1180px] flex-1 flex-col px-4 py-8 sm:px-6 sm:py-12">
          <div className="mb-7 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h1 className="font-heading text-2xl font-semibold tracking-[-0.045em] sm:text-[2rem]">
                Repository analyses
              </h1>
              <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                Map a public repository, then inspect every connection the parser can prove.
              </p>
            </div>
            <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {summary.map((item) => (
                <div key={item.label} className="flex items-baseline gap-1.5 whitespace-nowrap">
                  <dd className="font-mono text-sm font-semibold tabular-nums text-foreground">{item.value}</dd>
                  <dt>{item.label.toLowerCase()}</dt>
                </div>
              ))}
            </dl>
          </div>

          <div className="mb-9">
            <RepositoryForm />
          </div>

          <div className="mb-3 flex items-baseline justify-between gap-4">
            <h2 className="border-l-2 border-foreground pl-3 font-heading text-lg font-semibold tracking-[-0.025em]">Recent analyses</h2>
            <span className="text-sm text-muted-foreground">Latest 50 runs</span>
          </div>

          {analyses.length === 0 ? (
            <div className="grid min-h-72 flex-1 place-items-center px-6 py-12 text-center">
              <div className="max-w-xs">
                <div className="mx-auto mb-5 grid size-10 place-items-center rounded-full bg-imports/10 text-imports">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-4 text-muted"
                  >
                    <path
                      d="M8 7.5h8M8 12h8M8 16.5h5M5 3.5h14v17H5z"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.25"
                    />
                  </svg>
                </div>
                <h2 className="text-sm font-semibold">Map your first repository</h2>
                <p className="mt-2 text-xs leading-5 text-muted-foreground">
                  Paste a public GitHub URL above. Its analysis will appear here as soon as parsing starts.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className={`hidden rounded-md bg-surface-muted/65 text-sm font-semibold tracking-[-0.015em] text-foreground sm:grid ${canDeleteRepositories ? "grid-cols-[minmax(0,1fr)_12rem_13rem_3.5rem]" : "grid-cols-[minmax(0,1fr)_12rem_13rem]"}`}>
                <span className="py-4 pl-4 pr-5">Repository</span>
                <span className="px-5 py-4">Status</span>
                <span className="py-4 pl-5">Created</span>
                {canDeleteRepositories ? <span className="sr-only">Actions</span> : null}
              </div>
              <ul className="mt-1 space-y-1">
                {analyses.map((analysis) => (
                  <li
                    key={analysis.id}
                    className={`group rounded-md transition-colors hover:bg-surface-muted/55 focus-within:bg-surface-muted motion-reduce:transition-none ${canDeleteRepositories ? "grid grid-cols-[minmax(0,1fr)_3.5rem]" : "block"}`}
                  >
                    <Link
                      href={`/analyses/${analysis.id}`}
                      className="grid min-w-0 grid-cols-2 rounded-md outline-none sm:grid-cols-[minmax(0,1fr)_12rem_13rem] sm:items-center"
                    >
                      <div className="col-span-2 min-w-0 px-4 py-5 sm:col-span-1">
                        <span className="mb-2 block text-sm font-semibold text-foreground sm:hidden">Repository</span>
                        <p className="truncate text-base font-semibold tracking-[-0.015em]">
                          {analysis.project.repository_name}
                        </p>
                        <p className="mt-1.5 truncate font-mono text-xs text-muted-foreground">
                          {analysis.project.repository_url}
                        </p>
                      </div>
                      <div className="pb-5 pr-3 sm:px-5 sm:py-5">
                        <span className="mb-2 block text-sm font-semibold text-foreground sm:hidden">Status</span>
                        <div className="flex min-h-9 items-stretch gap-2.5">
                          <span className={`w-0.5 shrink-0 ${statusMarker(analysis.status)}`} />
                          <div className="min-w-0">
                            <p className="text-sm capitalize text-foreground">{analysis.status}</p>
                            {analysis.stage ? (
                              <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                {analysis.stage}
                              </p>
                            ) : null}
                          </div>
                        </div>
                      </div>
                      <div className="pb-5 pl-3 sm:py-5 sm:pl-5">
                        <span className="mb-2 block text-sm font-semibold text-foreground sm:hidden">Created</span>
                        <time dateTime={analysis.created_at} className="font-mono text-xs leading-5 text-foreground">
                          {dateFormatter.format(new Date(analysis.created_at))}
                        </time>
                      </div>
                    </Link>
                    {canDeleteRepositories ? (
                      <div className="grid place-items-center">
                        {analysis.status === "running" || analysis.status === "completed" || analysis.status === "failed" ? (
                          <DeleteRepositoryButton
                            projectId={analysis.project.id}
                            repositoryName={analysis.project.repository_name}
                          />
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
