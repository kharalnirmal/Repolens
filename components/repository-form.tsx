"use client";

import { useActionState } from "react";
import { ScanSearch } from "lucide-react";

import {
  analyzeRepository,
  type AnalyzeRepositoryState,
} from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initialState: AnalyzeRepositoryState = { status: "idle" };

export function RepositoryForm() {
  const [state, formAction, pending] = useActionState(
    analyzeRepository,
    initialState,
  );

  return (
    <form action={formAction}>
      <label htmlFor="repository-url" className="block text-sm font-semibold">Repository URL</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <div className="min-w-0 flex-1">
          <Input
            id="repository-url"
            name="repositoryUrl"
            type="url"
            inputMode="url"
            required
            autoComplete="url"
            placeholder="https://github.com/owner/repository"
            aria-describedby="repository-form-status"
            className="h-11 rounded-md bg-background px-3 font-mono text-sm placeholder:text-muted-foreground dark:bg-background"
          />
        </div>
        <Button type="submit" disabled={pending} className="h-11 shrink-0 rounded-md bg-foreground px-5 text-sm font-semibold text-background hover:bg-foreground/85 focus-visible:ring-imports disabled:cursor-wait">
          <ScanSearch aria-hidden="true" className="size-3.5" />
          {pending ? "Starting analysis..." : "Analyse repository"}
        </Button>
      </div>
      <p
        id="repository-form-status"
        aria-live="polite"
        className={`mt-2 text-xs leading-5 ${state.status === "error" ? "text-red-700 dark:text-red-400" : "text-muted-foreground"}`}
      >
        {state.message ?? "Public JavaScript or TypeScript repositories only."}
      </p>
    </form>
  );
}
