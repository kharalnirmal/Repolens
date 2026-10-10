"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { after } from "next/server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { explainTarget, type ExplanationResult, type ExplanationTarget } from "@/lib/ai/explain";
import { runAnalysis } from "@/lib/analysis/run-analysis";
import { parseGitHubRepositoryUrl } from "@/lib/github/repository-archive";
import { reconcileClerkOrganization } from "@/lib/organizations/sync";
import {
  createPrivilegedSupabaseClient,
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

export type DeleteRepositoryState = {
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

  try {
    const organizationExists = await reconcileClerkOrganization(authentication.orgId);
    if (!organizationExists) {
      return {
        status: "error",
        message: "The active organization is no longer available.",
      };
    }
  } catch (error) {
    console.error("Active organization reconciliation failed", error);
    return {
      status: "error",
      message: "Could not prepare the active organization. Try again.",
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
          createPrivilegedSupabaseClient(),
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
        await runAnalysis(createPrivilegedSupabaseClient(), supabase, analysisId);
      } catch (pipelineError) {
        console.error("Analysis pipeline failed", pipelineError);
      }
    });
  }

  redirect(`/analyses/${analysisId}`);
}

export async function deleteRepository(
  _previousState: DeleteRepositoryState,
  formData: FormData,
): Promise<DeleteRepositoryState> {
  const authentication = await auth();
  if (
    !authentication.userId ||
    !authentication.orgId ||
    !authentication.has({ role: "org:admin" })
  ) {
    return { status: "error", message: "Only organization admins can delete repositories." };
  }

  const projectId = formData.get("projectId");
  if (
    typeof projectId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(projectId)
  ) {
    return { status: "error", message: "Invalid repository." };
  }

  const supabase = createServerSupabaseClient(authentication.getToken);
  const { data: wasDeleted, error } = await supabase.rpc(
    "delete_repository_project",
    { p_project_id: projectId },
  );

  if (error) {
    return { status: "error", message: `Could not delete repository: ${error.message}` };
  }
  if (!wasDeleted) {
    return {
      status: "error",
      message: "The repository was not deleted. Its analysis may still be queued.",
    };
  }

  revalidatePath("/");
  return { status: "idle" };
}

export async function requestExplanation(
  analysisId: string,
  target: unknown,
): Promise<ExplanationResult> {
  const authentication = await auth();
  if (!authentication.userId || !authentication.orgId) {
    return { status: "error", message: "Select an organization first" };
  }
  if (!analysisId || !isExplanationTarget(target)) {
    return { status: "error", message: "Invalid explanation target" };
  }

  try {
    return await explainTarget(
      createServerSupabaseClient(authentication.getToken),
      createPrivilegedSupabaseClient(),
      analysisId,
      target,
    );
  } catch (error) {
    console.error("Explanation failed", error);
    return { status: "error", message: "Could not generate this explanation" };
  }
}

function isExplanationTarget(target: unknown): target is ExplanationTarget {
  return target !== null &&
    typeof target === "object" &&
    "path" in target &&
    typeof target.path === "string" &&
    target.path.trim().length > 0 &&
    "kind" in target &&
    (target.kind === "file" || target.kind === "folder");
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
