import "server-only";

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { traceable } from "langsmith/traceable";

import { explanationModel } from "@/lib/ai/client";
import {
  explanationPromptVersion,
  generateExplanation,
  type ExplanationPromptInput,
} from "@/lib/ai/explanation-core";
import { evaluateInventedPathsLive } from "@/lib/evals/invented-paths";
import {
  fetchCurrentRepositoryCommit,
  fetchRepositoryFile,
} from "@/lib/github/repository-archive";
import type { Database } from "@/lib/supabase/database.types";

export type ExplanationTarget =
  | { kind: "file"; path: string }
  | { kind: "folder"; path: string };

export type ExplanationResult =
  | { status: "ready"; content: string; shownPaths: string[] }
  | { status: "stale" }
  | { status: "error"; message: string };

interface StoredFile {
  id: string;
  path: string;
  content: string;
  content_hash: string;
}

export const explainTarget = traceable(
  async function explainTarget(
    supabase: SupabaseClient<Database>,
    worker: SupabaseClient<Database>,
    analysisId: string,
    target: ExplanationTarget,
  ): Promise<ExplanationResult> {
    const { data: analysis, error: analysisError } = await supabase
      .from("analyses")
      .select("commit_sha, organization_id, project:projects!analyses_organization_id_project_id_fkey(repository_url)")
      .eq("id", analysisId)
      .single();
    if (analysisError) throw analysisError;
    if (!analysis.commit_sha) throw new Error("Analysis has no stored commit");

    const repositoryUrl = analysis.project.repository_url;
    const currentCommit = await fetchCurrentRepositoryCommit(repositoryUrl);
    if (currentCommit !== analysis.commit_sha) return { status: "stale" };

    const { data: files, error: filesError } = await supabase
      .from("files")
      .select("id, path, content, content_hash")
      .eq("analysis_id", analysisId);
    if (filesError) throw filesError;

    const storedFiles = files as StoredFile[];
    const byId = new Map(storedFiles.map((file) => [file.id, file]));
    const targetFiles = target.kind === "file"
      ? storedFiles.filter((file) => file.path === target.path)
      : storedFiles.filter((file) => inFolder(file.path, target.path));
    if (targetFiles.length === 0) throw new Error("The selected target is not in this analysis");

    if (target.kind === "file") {
      const currentContent = await fetchRepositoryFile(
        repositoryUrl,
        currentCommit,
        target.path,
      );
      if (sha256(currentContent) !== targetFiles[0].content_hash) {
        return { status: "stale" };
      }
    }

    const contentHash = target.kind === "file"
      ? targetFiles[0].content_hash
      : sha256(
          targetFiles
            .toSorted((left, right) => left.path.localeCompare(right.path))
            .map((file) => `${file.path}\0${file.content_hash}`)
            .join("\0"),
        );
    const { data: edges, error: edgesError } = await supabase
      .from("edges")
      .select("source_file_id, target_file_id")
      .eq("analysis_id", analysisId);
    if (edgesError) throw edgesError;

    const targetIds = new Set(targetFiles.map((file) => file.id));
    const relevantEdges = edges.filter(
      (edge) => targetIds.has(edge.source_file_id) || targetIds.has(edge.target_file_id),
    );
    const availablePaths = new Set<string>();
    for (const file of targetFiles) availablePaths.add(file.path);
    for (const edge of relevantEdges) {
      const source = byId.get(edge.source_file_id);
      const destination = byId.get(edge.target_file_id);
      if (source) availablePaths.add(source.path);
      if (destination) availablePaths.add(destination.path);
    }
    availablePaths.add(target.path);
    const neighborFiles = [...availablePaths]
      .filter((path) => !targetFiles.some((file) => file.path === path))
      .map((path) => storedFiles.find((file) => file.path === path))
      .filter((file): file is StoredFile => file !== undefined);

    let cacheQuery = supabase
      .from("explanations")
      .select("content, shown_paths")
      .eq("analysis_id", analysisId)
      .eq("content_hash", contentHash)
      .eq("model", explanationModel)
      .eq("prompt_version", explanationPromptVersion);
    cacheQuery = target.kind === "file"
      ? cacheQuery.eq("file_id", targetFiles[0].id)
      : cacheQuery.eq("folder_path", target.path);
    const { data: cached, error: cacheError } = await cacheQuery.maybeSingle();
    if (cacheError) throw cacheError;
    if (cached) {
      try {
        await evaluateInventedPathsLive(cached.content, [...availablePaths]);
      } catch (error) {
        console.error("Invented path evaluation failed", error);
      }
      return {
        status: "ready",
        content: cached.content,
        shownPaths: cached.shown_paths,
      };
    }

    const promptInput: ExplanationPromptInput = {
      target,
      files: targetFiles.map((file) => ({ path: file.path, content: file.content })),
      neighbors: neighborFiles.map((file) => ({
        path: file.path,
        content: file.content,
      })),
      imports: relevantEdges.flatMap((edge) => {
        const from = byId.get(edge.source_file_id)?.path;
        const to = byId.get(edge.target_file_id)?.path;
        return from && to ? [{ from, to }] : [];
      }),
    };
    const content = await generateExplanation(promptInput);
    try {
      await evaluateInventedPathsLive(content, [...availablePaths]);
    } catch (error) {
      console.error("Invented path evaluation failed", error);
    }
    const shownPaths = [...availablePaths]
      .filter((path) => content.includes(path))
      .toSorted((left, right) => right.length - left.length || left.localeCompare(right));

    const { error: storeError } = await worker.from("explanations").insert({
      organization_id: analysis.organization_id,
      analysis_id: analysisId,
      file_id: target.kind === "file" ? targetFiles[0].id : null,
      folder_path: target.kind === "folder" ? target.path : null,
      content_hash: contentHash,
      model: explanationModel,
      prompt_version: explanationPromptVersion,
      content,
      shown_paths: shownPaths,
    });
    if (storeError && storeError.code !== "23505") throw storeError;

    return { status: "ready", content, shownPaths };
  },
  {
    name: "explain-repository-target",
    project_name: process.env.LANGSMITH_PROJECT,
    processInputs: (inputs) => {
      const [, , analysisId, target] = inputs.args;
      return { analysisId, target };
    },
  },
);

function inFolder(filePath: string, folderPath: string): boolean {
  return folderPath === "." || filePath.startsWith(`${folderPath}/`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
