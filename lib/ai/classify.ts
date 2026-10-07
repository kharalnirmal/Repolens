import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { traceable } from "langsmith/traceable";

import { classificationModel, getAIClient } from "@/lib/ai/client";
import type { Database } from "@/lib/supabase/database.types";
import type { FileRole, ParsedFile } from "@/parser/types";

const promptVersion = "file-role-v1";
const allowedRoles = [
  "service",
  "repository",
  "model",
  "util",
  "config",
  "component",
  "hook",
] as const;

type AllowedRole = (typeof allowedRoles)[number];

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

    const classifications = new Map<string, AllowedRole>();
    for (const item of cached) {
      if (isAllowedRole(item.role)) classifications.set(item.content_hash, item.role);
    }

    const missingByHash = new Map(
      candidates
        .filter((file) => !classifications.has(file.contentHash))
        .map((file) => [file.contentHash, file]),
    );
    const missing = [...missingByHash.values()];
    if (missing.length > 0) {
      const completion = await getAIClient().chat.completions.create({
        model: classificationModel,
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "file_roles",
            strict: true,
            schema: {
              type: "object",
              properties: {
                files: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      path: { type: "string" },
                      role: { type: "string", enum: allowedRoles },
                    },
                    required: ["path", "role"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["files"],
              additionalProperties: false,
            },
          },
        },
        messages: [
          {
            role: "system",
            content: `Classify each supplied file by its code, using exactly one of: ${allowedRoles.join(", ")}. These labels describe purpose only. Never use structural labels such as page, route, controller, layout, middleware, entry, or API. Return every supplied path exactly once.`,
          },
          {
            role: "user",
            content: JSON.stringify(
              missing.map((file) => ({ path: file.path, content: file.content })),
            ),
          },
        ],
      });
      const content = completion.choices[0]?.message.content;
      if (!content) throw new Error("The model returned no file classifications");
      const parsed = readClassifications(content, new Set(missing.map((file) => file.path)));

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

function readClassifications(content: string, expectedPaths: ReadonlySet<string>) {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object" || !("files" in value) || !Array.isArray(value.files)) {
    throw new Error("The model returned invalid file classifications");
  }

  const result = new Map<string, AllowedRole>();
  for (const item of value.files) {
    if (!item || typeof item !== "object" || !("path" in item) || !("role" in item)) continue;
    if (typeof item.path !== "string" || !expectedPaths.has(item.path) || !isAllowedRole(item.role)) continue;
    result.set(item.path, item.role);
  }
  if (result.size !== expectedPaths.size) {
    throw new Error("The model did not classify every supplied file exactly once");
  }
  return result;
}

function isAllowedRole(value: unknown): value is AllowedRole {
  return typeof value === "string" && (allowedRoles as readonly string[]).includes(value);
}
