"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

const stages = [
  { key: "fetch", label: "Fetch", detail: "Download the public repository archive" },
  { key: "select", label: "Select", detail: "Keep supported source files" },
  { key: "parse", label: "Parse", detail: "Resolve imports into dependency edges" },
  { key: "store", label: "Store", detail: "Write the graph and coverage report" },
] as const;

interface ProgressState {
  status: string;
  stage: string | null;
  message: string | null;
  error: string | null;
}

export function AnalysisProgress({
  analysisId,
  initialProgress,
}: {
  analysisId: string;
  initialProgress: ProgressState;
}) {
  const { getToken } = useAuth();
  const router = useRouter();
  const [progress, setProgress] = useState(initialProgress);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const supabase = createBrowserSupabaseClient(getToken);
    const channel = supabase.channel(`analysis:${analysisId}:progress`, {
      config: { private: true },
    });

    async function connect(): Promise<void> {
      const token = await getToken();
      if (!token || cancelled) return;
      await supabase.realtime.setAuth(token);
      if (cancelled) return;

      channel
        .on("broadcast", { event: "progress" }, (event) => {
          const next = parseProgress(event.payload);
          if (next) setProgress(next);
        })
        .subscribe(async (status) => {
          if (status !== "SUBSCRIBED" || cancelled) return;
          setConnected(true);

          // This closes the gap between the server render and socket subscription.
          const { data } = await supabase
            .from("analyses")
            .select("status, stage, status_message, error_message")
            .eq("id", analysisId)
            .single();
          if (data && !cancelled) {
            setProgress({
              status: data.status,
              stage: data.stage,
              message: data.status_message,
              error: data.error_message,
            });
          }
        });
    }

    void connect();
    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [analysisId, getToken]);

  useEffect(() => {
    if (progress.status === "completed") router.refresh();
  }, [progress.status, router]);

  const currentStageIndex = stages.findIndex((stage) => stage.key === progress.stage);
  const isComplete = progress.status === "completed";
  const isFailed = progress.status === "failed";

  return (
    <div className="border border-border bg-surface">
      <div className="flex min-h-10 items-center justify-between gap-4 border-b border-border bg-surface-muted px-3">
        <p className="font-mono text-[10px] text-muted">
          {progress.message ?? "Waiting to start"}
        </p>
        <span className="inline-flex shrink-0 items-center gap-2 font-mono text-[9px] text-muted">
          <span
            className={`size-1.5 ${
              isFailed ? "bg-red-500" : connected ? "bg-emerald-500" : "bg-amber-500"
            }`}
          />
          {isFailed ? "failed" : connected ? "live" : "connecting"}
        </span>
      </div>

      <ol aria-label="Analysis stages">
        {stages.map((stage, index) => {
          const done = isComplete || index < currentStageIndex;
          const active = !isComplete && index === currentStageIndex;
          const failed = active && isFailed;

          return (
            <li
              key={stage.key}
              className="grid grid-cols-[2.75rem_minmax(0,1fr)_5rem] border-b border-border last:border-b-0"
            >
              <span className="grid min-h-16 place-items-center border-r border-border font-mono text-[10px] text-muted">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0 px-3 py-3">
                <p className="font-mono text-[11px] font-semibold">{stage.label}</p>
                <p className="mt-1 text-[10px] leading-4 text-muted">{stage.detail}</p>
              </div>
              <div className="flex items-center justify-end px-3 font-mono text-[9px]">
                <span
                  className={
                    failed
                      ? "text-red-700 dark:text-red-400"
                      : done
                        ? "text-emerald-700 dark:text-emerald-400"
                        : active
                          ? "text-amber-700 dark:text-amber-400"
                          : "text-muted"
                  }
                >
                  {failed ? "failed" : done ? "done" : active ? "running" : "waiting"}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {progress.error ? (
        <div className="border-t border-red-300 bg-red-50 px-3 py-3 dark:border-red-900 dark:bg-red-950/30">
          <p className="font-mono text-[9px] text-red-700 dark:text-red-400">
            Failure detail
          </p>
          <p className="mt-1.5 break-words font-mono text-[10px] leading-4 text-red-800 dark:text-red-300">
            {progress.error}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function parseProgress(value: unknown): ProgressState | null {
  if (!value || typeof value !== "object") return null;
  const status = Reflect.get(value, "status");
  const stage = Reflect.get(value, "stage");
  const message = Reflect.get(value, "message");
  const error = Reflect.get(value, "error");

  if (
    typeof status !== "string" ||
    (stage !== null && typeof stage !== "string") ||
    (message !== null && typeof message !== "string") ||
    (error !== null && typeof error !== "string")
  ) {
    return null;
  }

  return { status, stage, message, error };
}
