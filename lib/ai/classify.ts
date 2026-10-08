import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { traceable } from "langsmith/traceable";

import {
  classifyFilesByPurpose,
  isAllowedClassificationRole,
  type AllowedClassificationRole,
} from "@/lib/ai/classification-core";
import { classificationModel } from "@/lib/ai/client";
import type { Database } from "@/lib/supabase/database.types";
import type { FileRole, ParsedFile } from "@/parser/types";

const promptVersion = "file-role-v1";

export const classifyFallbackFiles = traceable(
  async function classifyFallbackFiles(
    worker: SupabaseClient<Database>,
    organizationId: string,
    files: readonly ParsedFile[],
    roles: readonly FileRole[],
  ): Promise<FileRole[]> {
    const fallbackPaths = new Set(
      roles.filter((role) => role.source === "fallback").map((role) => role.filePath),
    );
    const candidates = files.filter((file) => fallbackPaths.has(file.path));
    if (candidates.length === 0) return [...roles];

    const hashes = [...new Set(candidates.map((file) => file.contentHash))];
    const { data: cached, error: cacheError } = await worker.rpc(
      "get_role_classifications",
      {
        p_organization_id: organizationId,
        p_content_hashes: hashes,
        p_model: classificationModel,
        p_prompt_version: promptVersion,
      },
    );
    if (cacheError) throw cacheError;

    const classifications = new Map<string, AllowedClassificationRole>();
    for (const item of cached) {
      if (isAllowedClassificationRole(item.role)) {
        classifications.set(item.content_hash, item.role);
      }
    }

    const missingByHash = new Map(
      candidates
        .filter((file) => !classifications.has(file.contentHash))
        .map((file) => [file.contentHash, file]),
    );
    const missing = [...missingByHash.values()];
    if (missing.length > 0) {
      const parsed = await classifyFilesByPurpose(missing);

      const rows = missing.map((file) => ({
        organization_id: organizationId,
        content_hash: file.contentHash,
        model: classificationModel,
        prompt_version: promptVersion,
        role: parsed.get(file.path) ?? "util",
      }));
      const { error: storeError } = await worker
        .from("role_classification_cache")
        .upsert(rows, {
          onConflict: "organization_id,content_hash,model,prompt_version",
          ignoreDuplicates: true,
        });
      if (storeError) throw storeError;
      for (const [path, role] of parsed) {
        const file = missing.find((candidate) => candidate.path === path);
        if (file) classifications.set(file.contentHash, role);
      }
    }

    return roles.map((role) => {
      if (role.source !== "fallback") return role;
      const file = candidates.find((candidate) => candidate.path === role.filePath);
      const classified = file ? classifications.get(file.contentHash) : undefined;
      return classified
        ? { filePath: role.filePath, role: classified, source: "model" as const }
        : role;
    });
  },
  {
    name: "classify-unidentified-files",
    project_name: process.env.LANGSMITH_PROJECT,
    processInputs: (inputs) => {
      const [, organizationId, files, roles] = inputs.args;
      return {
        organizationId,
        fileHashes: files.map((file) => file.contentHash),
        fallbackCount: roles.filter((role) => role.source === "fallback").length,
      };
    },
  },
);
