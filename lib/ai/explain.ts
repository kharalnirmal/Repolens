import "server-only";

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { traceable } from "langsmith/traceable";

import { explanationModel, getAIClient } from "@/lib/ai/client";
import {
  fetchCurrentRepositoryCommit,
  fetchRepositoryFile,
} from "@/lib/github/repository-archive";
import type { Database } from "@/lib/supabase/database.types";

const promptVersion = "explanation-v1";

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
    let cacheQuery = supabase
      .from("explanations")
      .select("content, shown_paths")
      .eq("analysis_id", analysisId)
      .eq("content_hash", contentHash)
      .eq("model", explanationModel)
      .eq("prompt_version", promptVersion);
    cacheQuery = target.kind === "file"
      ? cacheQuery.eq("file_id", targetFiles[0].id)
      : cacheQuery.eq("folder_path", target.path);
    const { data: cached, error: cacheError } = await cacheQuery.maybeSingle();
    if (cacheError) throw cacheError;
    if (cached) {
      return {
        status: "ready",
        content: cached.content,
        shownPaths: cached.shown_paths,
      };
    }

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
    const neighborFiles = [...availablePaths]
      .filter((path) => !targetFiles.some((file) => file.path === path))
      .map((path) => storedFiles.find((file) => file.path === path))
      .filter((file): file is StoredFile => file !== undefined);

    const completion = await getAIClient().chat.completions.create({
      model: explanationModel,
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: systemPrompt(target.kind),
        },
        {
          role: "user",
          content: JSON.stringify({
            target,
            files: targetFiles.map((file) => ({ path: file.path, content: file.content })),
            neighbors: neighborFiles.map((file) => ({
              path: file.path,
              content: file.content,
            })),
            imports: relevantEdges.map((edge) => ({
              from: byId.get(edge.source_file_id)?.path,
              to: byId.get(edge.target_file_id)?.path,
            })),
          }),
        },
      ],
    });
    const content = completion.choices[0]?.message.content?.trim();
    if (!content) throw new Error("The model returned an empty explanation");
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
      prompt_version: promptVersion,
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

function systemPrompt(kind: ExplanationTarget["kind"]): string {
  const question = kind === "file"
    ? "Explain what the target file does in the context of every direct file it imports and every direct file importing it."
    : "Explain what is in the target folder and why other files point at it. Treat the folder as the subject, not one representative file.";

  return `${question}

Use only facts in the supplied JSON. Never infer an import or name a repository path that was not supplied. Be concise and useful to a developer reading unfamiliar code.

The only permitted formatting is **bold**, \`inline code\`, and bullet lines beginning with "- ". Do not use headings, links, tables, fenced code, or other Markdown.`;
}

function inFolder(filePath: string, folderPath: string): boolean {
  return folderPath === "." || filePath.startsWith(`${folderPath}/`);
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
