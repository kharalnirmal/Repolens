"use client";

import { useActionState } from "react";

import {
  analyzeRepository,
  type AnalyzeRepositoryState,
} from "@/app/actions";

const initialState: AnalyzeRepositoryState = { status: "idle" };

export function RepositoryForm() {
  const [state, formAction, pending] = useActionState(
    analyzeRepository,
    initialState,
  );

  return (
    <form action={formAction} className="border border-border bg-surface">
      <div className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
        <label
          htmlFor="repository-url"
          className="shrink-0 font-mono text-[10px] font-medium text-muted"
        >
          Public repository
        </label>
        <input
          id="repository-url"
          name="repositoryUrl"
          type="url"
          inputMode="url"
          required
          autoComplete="url"
          placeholder="https://github.com/owner/repository"
          aria-describedby="repository-form-status"
          className="h-8 min-w-0 flex-1 border border-border bg-background px-2.5 font-mono text-[11px] outline-none placeholder:text-muted focus:border-accent"
        />
        <button
          type="submit"
          disabled={pending}
          className="h-8 shrink-0 border border-foreground bg-foreground px-4 font-mono text-[10px] font-semibold text-surface hover:border-accent hover:bg-accent disabled:cursor-wait disabled:opacity-60"
        >
          {pending ? "Starting..." : "Analyse repository"}
        </button>
      </div>
      <div className="flex min-h-7 items-center border-t border-border bg-surface-muted px-3">
        <p
          id="repository-form-status"
          aria-live="polite"
          className={`text-[10px] ${
            state.status === "error" ? "text-red-700 dark:text-red-400" : "text-muted"
          }`}
        >
          {state.message ?? "Public GitHub repositories only. No repository token is stored."}
        </p>
      </div>
    </form>
  );
}
