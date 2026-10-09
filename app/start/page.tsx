import Link from "next/link";
import { auth } from "@clerk/nextjs/server";

import { analyzeRepository } from "@/app/actions";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface StartAnalysisPageProps {
  searchParams: Promise<{ repositoryUrl?: string | string[] }>;
}

export default async function StartAnalysisPage({ searchParams }: StartAnalysisPageProps) {
  await auth.protect();

  const { repositoryUrl } = await searchParams;
  const formData = new FormData();
  formData.set("repositoryUrl", typeof repositoryUrl === "string" ? repositoryUrl : "");

  const result = await analyzeRepository({ status: "idle" }, formData);

  return (
    <main className="grid min-h-screen place-items-center bg-background px-6 text-foreground">
      <Alert className="w-full max-w-md gap-0 rounded-none border-border bg-surface p-6 text-foreground">
        <AlertTitle className="text-lg font-semibold tracking-[-0.035em]">
          Could not start analysis
        </AlertTitle>
        <AlertDescription className="mt-3 text-sm leading-6 text-muted">
          {result.message}
        </AlertDescription>
        <Button
          render={<Link href="/" />}
          className="mt-6 w-fit rounded-none border border-foreground bg-foreground px-4 font-mono text-[10px] font-semibold text-surface hover:border-accent hover:bg-accent"
        >
          Return to workspace
        </Button>
      </Alert>
    </main>
  );
}
