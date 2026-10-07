import type { SupabaseClient } from "@supabase/supabase-js";

import { classifyFallbackFiles } from "@/lib/ai/classify";
import { withFetchedRepository } from "@/lib/github/repository-archive";
import type { Database, Json } from "@/lib/supabase/database.types";
import { parseRepository } from "@/parser/index";

export type AnalysisStage = "fetch" | "select" | "parse" | "store";

export async function runAnalysis(
  worker: SupabaseClient<Database>,
  legacyCaller: SupabaseClient<Database>,
  analysisId: string,
): Promise<void> {
  let stage: AnalysisStage = "fetch";

  try {
    const { data: analysis, error: analysisError } = await worker
      .from("analyses")
      .select("project_id, organization_id")
      .eq("id", analysisId)
      .single();
    if (analysisError) throw analysisError;

    const { data: project, error: projectError } = await worker
      .from("projects")
      .select("repository_url")
      .eq("id", analysis.project_id)
      .single();
    if (projectError) throw projectError;

    await setRunState(
      worker,
      legacyCaller,
      analysisId,
      stage,
      "Fetching repository archive",
    );

    await withFetchedRepository(project.repository_url, async (repository) => {
      stage = "select";
      await setRunState(
        worker,
        legacyCaller,
        analysisId,
        stage,
        "Selecting supported source files",
      );

      const result = await parseRepository(repository.directoryPath, {
        onFilesSelected: async (fileCount) => {
          stage = "parse";
          await setRunState(
            worker,
            legacyCaller,
            analysisId,
            stage,
            `Parsing ${fileCount} source files`,
          );
        },
      });
      const fileRoles = await classifyFallbackFiles(
        worker,
        analysis.organization_id,
        result.files,
        result.fileRoles,
      );

      stage = "store";
      await setRunState(
        worker,
        legacyCaller,
        analysisId,
        stage,
        "Storing dependency graph",
      );

      const resultArguments = {
        p_analysis_id: analysisId,
        p_commit_sha: repository.commitSha,
        p_framework: result.adapter.framework,
        p_coverage: toJson(result.coverage),
        p_files: toJson(
          result.files.map((file) => ({
            path: file.path,
            content: file.content,
            content_hash: file.contentHash,
            line_count: file.lineCount,
            module_kind: file.moduleKind,
            exports: file.exports,
          })),
        ),
        p_edges: toJson(
          result.edges.map((edge) => ({
            source_path: edge.sourcePath,
            target_path: edge.targetPath,
            kind: edge.kind,
            specifier: edge.specifier,
          })),
        ),
        p_file_roles: toJson(
          fileRoles.map((fileRole) => ({
            file_path: fileRole.filePath,
            role: fileRole.role,
            source: fileRole.source,
          })),
        ),
        p_routes: toJson(
          result.routes.map((route) => ({
            file_path: route.filePath,
            method: route.method,
            path: route.path,
          })),
        ),
      };
      let { error } = await worker.rpc("store_analysis_result", resultArguments);
      if (requiresOrganizationClaim(error)) {
        ({ error } = await legacyCaller.rpc(
          "store_analysis_result",
          resultArguments,
        ));
      }
      if (isOldStorageSignature(error)) {
        const legacyArguments = {
          p_analysis_id: resultArguments.p_analysis_id,
          p_commit_sha: resultArguments.p_commit_sha,
          p_framework: resultArguments.p_framework,
          p_coverage: resultArguments.p_coverage,
          p_files: resultArguments.p_files,
          p_edges: resultArguments.p_edges,
        };
        ({ error } = await legacyCaller.rpc(
          "store_analysis_result",
          legacyArguments,
        ));
      }
      if (error) throw error;
    });
  } catch (error) {
    const message = errorMessage(error);
    const stateError = await writeRunState(worker, legacyCaller, {
      p_analysis_id: analysisId,
      p_status: "failed",
      p_stage: stage,
      p_status_message: `Failed during ${stage}`,
      p_error_message: message,
    });

    if (stateError) {
      throw new AggregateError(
        [error, stateError],
        `Analysis failed during ${stage}, and its failed state could not be stored`,
      );
    }
    throw error;
  }
}

async function setRunState(
  worker: SupabaseClient<Database>,
  legacyCaller: SupabaseClient<Database>,
  analysisId: string,
  stage: AnalysisStage,
  message: string,
): Promise<void> {
  const error = await writeRunState(worker, legacyCaller, {
    p_analysis_id: analysisId,
    p_status: "running",
    p_stage: stage,
    p_status_message: message,
    p_error_message: null,
  });
  if (error) throw error;
}

type RunStateArguments = Database["public"]["Functions"]["set_analysis_run_state"]["Args"];

async function writeRunState(
  worker: SupabaseClient<Database>,
  legacyCaller: SupabaseClient<Database>,
  arguments_: RunStateArguments,
) {
  let { error } = await worker.rpc("set_analysis_run_state", arguments_);
  if (requiresOrganizationClaim(error)) {
    ({ error } = await legacyCaller.rpc("set_analysis_run_state", arguments_));
  }
  return error;
}

function requiresOrganizationClaim(
  error: { message: string } | null,
): boolean {
  return error?.message.includes("An active organization is required") ?? false;
}

function isOldStorageSignature(
  error: { code?: string } | null,
): boolean {
  return error?.code === "PGRST202";
}

function toJson(value: unknown): Json {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "boolean"
  ) {
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("Analysis contains a non-finite number");
    return value;
  }
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === "object") {
    const result: { [key: string]: Json | undefined } = {};
    for (const [key, item] of Object.entries(value)) {
      if (item !== undefined) result[key] = toJson(item);
    }
    return result;
  }
  throw new Error(`Analysis contains a non-JSON value: ${typeof value}`);
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    error !== null &&
    typeof error === "object" &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error);
}
