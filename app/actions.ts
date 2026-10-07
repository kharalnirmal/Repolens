"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { after } from "next/server";
import { redirect } from "next/navigation";

import { runAnalysis } from "@/lib/analysis/run-analysis";
import { parseGitHubRepositoryUrl } from "@/lib/github/repository-archive";
import {
  createAnalysisWorkerClient,
  createServerSupabaseClient,
} from "@/lib/supabase/server";

export type InviteState = {
  status: "idle" | "success" | "error";
  message?: string;
};

export type AnalyzeRepositoryState = {
  status: "idle" | "error";
  message?: string;
};

export async function analyzeRepository(
  _previousState: AnalyzeRepositoryState,
  formData: FormData,
): Promise<AnalyzeRepositoryState> {
  const authentication = await auth();
  if (!authentication.userId || !authentication.orgId) {
    return { status: "error", message: "Select an organization first" };
  }

  const value = formData.get("repositoryUrl");
  let repository;
  try {
    repository = parseGitHubRepositoryUrl(
      typeof value === "string" ? value : "",
    );
  } catch (error) {
    return {
      status: "error",
      message: error instanceof Error ? error.message : "Enter a valid GitHub URL",
    };
  }

  const supabase = createServerSupabaseClient(authentication.getToken);
  const { data, error } = await supabase.rpc("create_or_get_analysis", {
    p_repository_url: repository.canonicalUrl,
    p_repository_name: repository.name,
  });

  const analysis = data?.[0];
  if (error || !analysis) {
    return {
      status: "error",
      message: error?.message ?? "Could not create the analysis",
    };
  }

  if (analysis.was_created) {
    after(async () => {
      try {
        await runAnalysis(
          createAnalysisWorkerClient(),
          supabase,
          analysis.analysis_id,
        );
      } catch (pipelineError) {
        console.error("Analysis pipeline failed", pipelineError);
      }
    });
  }

  redirect(`/analyses/${analysis.analysis_id}`);
}

export async function rerunAnalysis(formData: FormData): Promise<void> {
  const authentication = await auth();
  if (!authentication.userId || !authentication.orgId) redirect("/");

  const analysisId = formData.get("analysisId");
  if (typeof analysisId !== "string" || !analysisId) redirect("/");

  const supabase = createServerSupabaseClient(authentication.getToken);
  const { data: shouldRun, error } = await supabase.rpc("restart_failed_analysis", {
    p_analysis_id: analysisId,
  });
  if (error) throw new Error(`Could not restart analysis: ${error.message}`);

  if (shouldRun) {
    after(async () => {
      try {
        await runAnalysis(createAnalysisWorkerClient(), supabase, analysisId);
      } catch (pipelineError) {
        console.error("Analysis pipeline failed", pipelineError);
      }
    });
  }

  redirect(`/analyses/${analysisId}`);
}

export async function inviteMember(
  _previousState: InviteState,
  formData: FormData,
): Promise<InviteState> {
  const { has, orgId, userId } = await auth();

  if (!userId || !orgId || !has({ role: "org:admin" })) {
    return { status: "error", message: "Not authorized" };
  }

  const emailValue = formData.get("email");
  const emailAddress =
    typeof emailValue === "string" ? emailValue.trim().toLowerCase() : "";

  if (!/^\S+@\S+\.\S+$/.test(emailAddress)) {
    return { status: "error", message: "Enter a valid email" };
  }

  try {
    const client = await clerkClient();
    await client.organizations.createOrganizationInvitation({
      organizationId: orgId,
      inviterUserId: userId,
      emailAddress,
      role: "org:member",
      redirectUrl: "/sign-in",
    });

    return { status: "success", message: "Invitation sent" };
  } catch {
    return { status: "error", message: "Could not send invitation" };
  }
}
