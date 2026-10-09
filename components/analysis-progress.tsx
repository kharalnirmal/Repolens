"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
    <div>
      <div className="flex items-center justify-between gap-4">
        <p className="text-base font-medium">
          {progress.message ?? "Waiting to start"}
        </p>
        <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-muted-foreground">
          <span
            className={`size-2 rounded-full ${
              isFailed ? "bg-destructive" : connected ? "bg-imports" : "bg-muted-foreground"
            }`}
          />
          {isFailed ? "failed" : connected ? "live" : "connecting"}
        </span>
      </div>

      <ol aria-label="Analysis stages" className="mt-8">
        {stages.map((stage, index) => {
          const done = isComplete || index < currentStageIndex;
          const active = !isComplete && index === currentStageIndex;
          const failed = active && isFailed;

          return (
            <li
              key={stage.key}
              className="relative grid grid-cols-[1.5rem_minmax(0,1fr)_4.5rem] gap-x-4 pb-7 last:pb-0"
            >
              {index < stages.length - 1 ? (
                <span aria-hidden="true" className="absolute bottom-0 left-[11px] top-6 w-px bg-border" />
              ) : null}
              <span
                className={`relative z-10 grid size-6 place-items-center rounded-full border font-mono text-[9px] ${
                  failed
                    ? "border-destructive text-destructive"
                    : done
                      ? "border-foreground bg-foreground text-background"
                      : active
                        ? "border-imports text-imports"
                        : "border-border bg-background text-muted-foreground"
                }`}
              >
                {index + 1}
              </span>
              <div className="min-w-0 pt-0.5">
                <p className="text-sm font-semibold">{stage.label}</p>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{stage.detail}</p>
              </div>
              <div className="pt-0.5 text-right text-xs font-semibold">
                <span
                  className={
                    failed
                      ? "text-destructive"
                      : done
                        ? "text-foreground"
                        : active
                          ? "text-imports"
                          : "text-muted-foreground"
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
        <Alert
          variant="destructive"
          className="mt-4 gap-0.5 rounded-md border-destructive/25 bg-destructive/5 px-3 py-3"
        >
          <AlertTitle className="text-xs font-semibold text-destructive">
            Failure detail
          </AlertTitle>
          <AlertDescription className="mt-1 break-words font-mono text-xs leading-5 text-destructive">
            {progress.error}
          </AlertDescription>
        </Alert>
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
