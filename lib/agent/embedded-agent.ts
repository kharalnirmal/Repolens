import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { createAgent, tool } from "langchain";
import { z } from "zod";

import { getAgentModel } from "@/lib/ai/client";
import { repositoryAssistantInstructions } from "@/lib/agent/instructions";
import { runRepositoryTool } from "@/lib/agent/repository-tools";
import type { Database } from "@/lib/supabase/database.types";

const emptyInput = z.object({});
const pathInput = z.object({
  filePath: z.string().min(1).describe("An exact file path returned by a repository tool."),
});

export const embeddedRepositoryToolNames = [
  "get_analysis_summary",
  "search_files",
  "list_files_by_role",
  "get_file_neighbors",
  "walk_dependencies",
  "get_route_table",
] as const;

export function isEmbeddedRepositoryToolName(
  value: string,
): value is (typeof embeddedRepositoryToolNames)[number] {
  return (embeddedRepositoryToolNames as readonly string[]).includes(value);
}

export function createRepositoryAgent(
  supabase: SupabaseClient<Database>,
  analysisId: string,
) {
  const call = async (
    name: Parameters<typeof runRepositoryTool>[2],
    input: Record<string, unknown>,
  ) => JSON.stringify(await runRepositoryTool(supabase, analysisId, name, input));

  const tools = [
    tool((input) => call("summary", input), {
      name: "get_analysis_summary",
      description:
        "Get the repository-wide analysis summary, including framework, coverage, file and edge counts, roles, and graph insights.",
      schema: emptyInput,
    }),
    tool((input) => call("search-files", input), {
      name: "search_files",
      description:
        "Find analyzed files whose path contains a case-insensitive path fragment. Use this to locate exact file paths before querying relationships.",
      schema: z.object({
        pathFragment: z.string().min(1).describe("Part of a file or directory path."),
        limit: z.number().int().min(1).max(100).default(25),
      }),
    }),
    tool((input) => call("files-by-role", input), {
      name: "list_files_by_role",
      description:
        "List analyzed files assigned an exact role such as page, route, controller, service, component, utility, config, or entry.",
      schema: z.object({
        role: z.string().min(1).describe("The exact file role to list."),
        limit: z.number().int().min(1).max(100).default(50),
      }),
    }),
    tool((input) => call("neighbors", input), {
      name: "get_file_neighbors",
      description:
        "Get only the direct importers and direct dependencies of one exact analyzed file, including the parser-resolved edge details.",
      schema: pathInput,
    }),
    tool((input) => call("walk", input), {
      name: "walk_dependencies",
      description:
        "Walk parser-resolved dependencies from one exact file. Incoming follows importers for blast radius; outgoing follows dependencies.",
      schema: pathInput.extend({
        direction: z.enum(["incoming", "outgoing"]),
        depth: z.number().int().min(1).max(10).default(2),
      }),
    }),
    tool((input) => call("routes", input), {
      name: "get_route_table",
      description:
        "Get the complete route table recovered by the framework adapter, with exact method, path, and source file. An empty result means no routes were recovered.",
      schema: emptyInput,
    }),
  ];

  return createAgent({
    model: getAgentModel(),
    tools,
    systemPrompt: repositoryAssistantInstructions,
  });
}
