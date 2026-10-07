"use client";

import { useAuth } from "@clerk/nextjs";
import { useRouter } from "next/navigation";
import { startTransition, useEffect } from "react";

import { createBrowserSupabaseClient } from "@/lib/supabase/browser";

export function AnalysisRealtimeRefresh({ analysisIds }: { analysisIds: string[] }) {
  const { getToken } = useAuth();
  const router = useRouter();
  const analysisKey = analysisIds.join(",");

  useEffect(() => {
    if (!analysisKey) return;

    const supabase = createBrowserSupabaseClient(getToken);
    const channels = analysisKey.split(",").map((analysisId) =>
      supabase.channel(`analysis:${analysisId}:progress`, {
        config: { private: true },
      }),
    );
    let cancelled = false;

    async function connect(): Promise<void> {
      const token = await getToken();
      if (!token || cancelled) return;
      await supabase.realtime.setAuth(token);
      if (cancelled) return;

      for (const channel of channels) {
        channel
          .on("broadcast", { event: "progress" }, () => {
            startTransition(() => router.refresh());
          })
          .subscribe();
      }
    }

    void connect();

    return () => {
      cancelled = true;
      for (const channel of channels) void supabase.removeChannel(channel);
    };
  }, [analysisKey, getToken, router]);

  return null;
}
