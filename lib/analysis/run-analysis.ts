import type { SupabaseClient } from "@supabase/supabase-js";

import { withFetchedRepository } from "@/lib/github/repository-archive";
import type { Database, Json } from "@/lib/supabase/database.types";
import { parseRepository } from "@/parser/index";

export type AnalysisStage = "fetch" | "select" | "parse" | "store";

export async function runAnalysis(
  supabase: SupabaseClient<Database>,
  analysisId: string,
): Promise<void> {
  let stage: AnalysisStage = "fetch";

  try {
    const { data: analysis, error: analysisError } = await supabase
      .from("analyses")
      .select("project_id")
      .eq("id", analysisId)
      .single();
    if (analysisError) throw analysisError;

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("repository_url")
      .eq("id", analysis.project_id)
      .single();
    if (projectError) throw projectError;

    await setRunState(supabase, analysisId, stage, "Fetching repository archive");

    await withFetchedRepository(project.repository_url, async (repository) => {
      stage = "select";
      await setRunState(
        supabase,
        analysisId,
        stage,
        "Selecting supported source files",
      );

      const result = await parseRepository(repository.directoryPath, {
        onFilesSelected: async (fileCount) => {
          stage = "parse";
          await setRunState(
            supabase,
            analysisId,
            stage,
            `Parsing ${fileCount} source files`,
          );
        },
      });

      stage = "store";
      await setRunState(supabase, analysisId, stage, "Storing dependency graph");

      const { error } = await supabase.rpc("store_analysis_result", {
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
      });
      if (error) throw error;
    });
  } catch (error) {
    const message = errorMessage(error);
    const { error: stateError } = await supabase.rpc("set_analysis_run_state", {
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
  supabase: SupabaseClient<Database>,
  analysisId: string,
  stage: AnalysisStage,
  message: string,
): Promise<void> {
  const { error } = await supabase.rpc("set_analysis_run_state", {
    p_analysis_id: analysisId,
    p_status: "running",
    p_stage: stage,
    p_status_message: message,
    p_error_message: null,
  });
  if (error) throw error;
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
  return error instanceof Error ? error.message : String(error);
}
