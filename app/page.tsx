import { OrganizationSwitcher, UserButton } from "@clerk/nextjs";
import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import { AnalysisRealtimeRefresh } from "@/components/analysis-realtime-refresh";
import { InviteMemberForm } from "@/components/invite-member-form";
import { RepositoryForm } from "@/components/repository-form";
import { ThemeControl } from "@/components/theme-control";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const dateFormatter = new Intl.DateTimeFormat("en", {
  dateStyle: "medium",
  timeStyle: "short",
});

export const maxDuration = 300;

function statusStyle(status: string) {
  switch (status) {
    case "completed":
      return { dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" };
    case "running":
      return { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" };
    case "failed":
      return { dot: "bg-red-500", text: "text-red-700 dark:text-red-400" };
    default:
      return { dot: "bg-muted", text: "text-muted" };
  }
}

export default async function WorkspacePage() {
  await auth.protect();
  const authentication = await auth();

  const { has, orgId, orgSlug } = authentication;

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

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      <header className="flex min-h-14 flex-wrap items-center gap-3 border-b border-border bg-surface px-3 py-2 sm:px-5">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="grid size-7 shrink-0 place-items-center border border-foreground bg-foreground font-mono text-[9px] font-bold tracking-[-0.08em] text-surface">
            RL
          </div>
          <span className="font-mono text-[13px] font-semibold tracking-[-0.03em]">
            RepoLens
          </span>
          <span className="mx-1 hidden h-4 w-px bg-border sm:block" />
          <OrganizationSwitcher
            hidePersonal
            afterCreateOrganizationUrl="/"
            afterSelectOrganizationUrl="/"
            afterLeaveOrganizationUrl="/"
          />
        </div>

        <div className="ml-auto flex items-center gap-1.5">
          {has({ role: "org:admin" }) ? <InviteMemberForm /> : null}
          <ThemeControl />
          <UserButton />
        </div>
      </header>

      <main className="flex flex-1 flex-col">
        <AnalysisRealtimeRefresh analysisIds={activeAnalysisIds} />
        <div className="flex h-9 items-center border-b border-border bg-surface-muted px-3 font-mono text-[10px] text-muted sm:px-5">
          <span>workspace</span>
          <svg
            aria-hidden="true"
            viewBox="0 0 12 12"
            className="mx-2 size-2.5 text-border"
          >
            <path d="m4 2 4 4-4 4" fill="none" stroke="currentColor" />
          </svg>
          <span className="truncate text-foreground">
            {orgSlug ?? orgId ?? "No active organization"}
          </span>
        </div>

        <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col px-3 py-6 sm:px-5 sm:py-9">
          <div className="mb-6 flex items-end justify-between gap-4 sm:mb-8">
            <div>
              <h1 className="text-xl font-semibold tracking-[-0.035em] sm:text-2xl">
                Repository analyses
              </h1>
              <p className="mt-1.5 max-w-lg text-xs leading-5 text-muted">
                Parsed repositories and the current state of each analysis run.
              </p>
            </div>
            <span className="hidden font-mono text-[10px] text-muted sm:block">
              latest 50 records
            </span>
          </div>

          <div className="mb-3">
            <RepositoryForm />
          </div>

          <dl className="mb-3 grid grid-cols-2 border-l border-t border-border sm:grid-cols-4">
            {summary.map((item) => (
              <div
                key={item.label}
                className="flex min-h-20 flex-col justify-between border-b border-r border-border bg-surface p-3 sm:min-h-24 sm:p-4"
              >
                <dt className="font-mono text-[10px] text-muted">
                  {item.label}
                </dt>
                <dd className="font-mono text-2xl font-medium tracking-[-0.06em] sm:text-3xl">
                  {String(item.value).padStart(2, "0")}
                </dd>
              </div>
            ))}
          </dl>

          {analyses.length === 0 ? (
            <div className="grid min-h-64 flex-1 place-items-center border border-border bg-surface px-6 py-12 text-center">
              <div className="max-w-xs">
                <div className="mx-auto mb-5 grid size-10 place-items-center border border-border bg-surface-muted">
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
                <h2 className="text-sm font-semibold">No analyses yet</h2>
                <p className="mt-2 text-xs leading-5 text-muted">
                  Repository runs for this workspace will appear here.
                </p>
              </div>
            </div>
          ) : (
            <div className="overflow-hidden border border-border bg-surface">
              <div className="hidden grid-cols-[2.75rem_minmax(0,1fr)_10rem_11rem] border-b border-border bg-surface-muted font-mono text-[10px] text-muted sm:grid">
                <span className="border-r border-border px-3 py-2.5">#</span>
                <span className="px-3 py-2.5">Repository</span>
                <span className="px-3 py-2.5">State</span>
                <span className="px-3 py-2.5">Created</span>
              </div>
              <ul>
                {analyses.map((analysis, index) => {
                  const status = statusStyle(analysis.status);

                  return (
                    <li
                      key={analysis.id}
                      className="group border-b border-border last:border-b-0"
                    >
                      <Link
                        href={`/analyses/${analysis.id}`}
                        className="grid gap-3 px-3 py-3.5 outline-none hover:bg-surface-muted focus-visible:bg-surface-muted sm:grid-cols-[2.75rem_minmax(0,1fr)_10rem_11rem] sm:items-center sm:gap-0 sm:p-0"
                      >
                        <span className="hidden self-stretch border-r border-border px-3 py-4 font-mono text-[10px] text-muted sm:block">
                          {String(index + 1).padStart(2, "0")}
                        </span>
                        <div className="min-w-0 sm:px-3 sm:py-3.5">
                          <p className="truncate font-mono text-[11px] font-semibold">
                            {analysis.project.repository_name}
                          </p>
                          <p className="mt-1.5 truncate font-mono text-[10px] text-muted">
                            {analysis.project.repository_url}
                          </p>
                        </div>
                        <div className="flex items-center sm:block sm:px-3 sm:py-3.5">
                          <span className="inline-flex items-center gap-2 font-mono text-[10px]">
                            <span className={`size-1.5 ${status.dot}`} />
                            <span className={status.text}>{analysis.status}</span>
                          </span>
                          {analysis.stage ? (
                            <p className="ml-2 truncate font-mono text-[10px] text-muted sm:ml-3.5 sm:mt-1">
                              {analysis.stage}
                            </p>
                          ) : null}
                        </div>
                        <time
                          dateTime={analysis.created_at}
                          className="font-mono text-[10px] text-muted sm:px-3 sm:py-3.5"
                        >
                          {dateFormatter.format(new Date(analysis.created_at))}
                        </time>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
