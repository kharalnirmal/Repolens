import { classificationModel, getAIClient } from "./client.ts";

export const allowedClassificationRoles = [
  "service",
  "repository",
  "model",
  "util",
  "config",
  "component",
  "hook",
] as const;

export type AllowedClassificationRole =
  (typeof allowedClassificationRoles)[number];

interface ClassificationFile {
  path: string;
  content: string;
}

const batchSize = 20;
const maxFileContentLength = 12_000;

export async function classifyFilesByPurpose(
  files: readonly ClassificationFile[],
): Promise<Map<string, AllowedClassificationRole>> {
  const result = new Map<string, AllowedClassificationRole>();

  for (let offset = 0; offset < files.length; offset += batchSize) {
    const batch = files.slice(offset, offset + batchSize);
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
                    role: { type: "string", enum: allowedClassificationRoles },
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
          content: `Classify each supplied file by its code, using exactly one of: ${allowedClassificationRoles.join(", ")}. These labels describe purpose only. Never use structural labels such as page, route, controller, layout, middleware, entry, or API. Return every supplied path exactly once.`,
        },
        {
          role: "user",
          content: JSON.stringify(
            batch.map((file) => ({
              path: file.path,
              content: file.content.slice(0, maxFileContentLength),
            })),
          ),
        },
      ],
    });
    const content = completion.choices[0]?.message.content;
    if (!content) throw new Error("The model returned no file classifications");

    const parsed = readClassifications(
      content,
      new Set(batch.map((file) => file.path)),
    );
    for (const [path, role] of parsed) result.set(path, role);
  }

  return result;
}

function readClassifications(
  content: string,
  expectedPaths: ReadonlySet<string>,
): Map<string, AllowedClassificationRole> {
  const value: unknown = JSON.parse(content);
  if (!value || typeof value !== "object" || !("files" in value) || !Array.isArray(value.files)) {
    throw new Error("The model returned invalid file classifications");
  }

  const result = new Map<string, AllowedClassificationRole>();
  for (const item of value.files) {
    if (!item || typeof item !== "object" || !("path" in item) || !("role" in item)) continue;
    if (
      typeof item.path !== "string" ||
      !expectedPaths.has(item.path) ||
      !isAllowedClassificationRole(item.role)
    ) {
      continue;
    }
    result.set(item.path, item.role);
  }
  if (result.size !== expectedPaths.size) {
    throw new Error("The model did not classify every supplied file exactly once");
  }
  return result;
}

export function isAllowedClassificationRole(
  value: unknown,
): value is AllowedClassificationRole {
  return typeof value === "string" &&
    (allowedClassificationRoles as readonly string[]).includes(value);
}
