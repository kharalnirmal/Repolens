import { tool, type ToolRuntime } from "langchain";
import { z } from "zod";

type RepositoryToolName =
  | "summary"
  | "search-files"
  | "files-by-role"
  | "neighbors"
  | "walk"
  | "routes";

const emptyInput = z.object({});
const pathInput = z.object({
  filePath: z.string().min(1).describe("An exact file path returned by a repository tool."),
});

async function callRepositoryTool(
  name: RepositoryToolName,
  input: Record<string, unknown>,
  runtime: ToolRuntime,
): Promise<string> {
  const apiUrl = process.env.REPOLENS_API_URL?.trim();
  if (!apiUrl) throw new Error("RepoLens tool API is not configured");

  const context = z
    .object({ analysisCredential: z.string().min(1) })
    .safeParse(runtime.context);
  if (!context.success) throw new Error("This conversation has no analysis credential");

  const response = await fetch(new URL(`/api/agent/tools/${name}`, apiUrl), {
    method: "POST",
    headers: {
      accept: "application/json",
      authorization: `Bearer ${context.data.analysisCredential}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(input),
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    let message = `RepoLens tool API returned ${response.status}`;
    if (response.status >= 400 && response.status < 500) {
      try {
        const errorBody: unknown = await response.json();
        if (
          errorBody !== null &&
          typeof errorBody === "object" &&
          !Array.isArray(errorBody) &&
          typeof (errorBody as Record<string, unknown>).error === "string" &&
          ((errorBody as Record<string, unknown>).error as string).trim()
        ) {
          message += `: ${((errorBody as Record<string, unknown>).error as string).trim()}`;
        }
      } catch {
        // Keep the status-based message when the body is unreadable.
      }
    }
    throw new Error(message);
  }

  const result: unknown = await response.json();
  return JSON.stringify(result);
}

export const getAnalysisSummary = tool(
  async (input, runtime: ToolRuntime) => callRepositoryTool("summary", input, runtime),
  {
    name: "get_analysis_summary",
    description:
      "Get the repository-wide analysis summary, including framework, coverage, file and edge counts, roles, and graph insights.",
    schema: emptyInput,
  },
);

export const searchFiles = tool(
  async (input, runtime: ToolRuntime) =>
    callRepositoryTool("search-files", input, runtime),
  {
    name: "search_files",
    description:
      "Find analyzed files whose path contains a case-insensitive path fragment. Use this to locate exact file paths before querying relationships.",
    schema: z.object({
      pathFragment: z.string().min(1).describe("Part of a file or directory path."),
      limit: z.number().int().min(1).max(100).default(25),
    }),
  },
);

export const listFilesByRole = tool(
  async (input, runtime: ToolRuntime) =>
    callRepositoryTool("files-by-role", input, runtime),
  {
    name: "list_files_by_role",
    description:
      "List analyzed files assigned an exact role such as page, route, controller, service, component, utility, config, or entry.",
    schema: z.object({
      role: z.string().min(1).describe("The exact file role to list."),
      limit: z.number().int().min(1).max(100).default(50),
    }),
  },
);

export const getFileNeighbors = tool(
  async (input, runtime: ToolRuntime) => callRepositoryTool("neighbors", input, runtime),
  {
    name: "get_file_neighbors",
    description:
      "Get only the direct importers and direct dependencies of one exact analyzed file, including the parser-resolved edge details.",
    schema: pathInput,
  },
);

export const walkDependencies = tool(
  async (input, runtime: ToolRuntime) => callRepositoryTool("walk", input, runtime),
  {
    name: "walk_dependencies",
    description:
      "Walk parser-resolved dependencies from one exact file. Incoming follows importers for blast radius; outgoing follows dependencies.",
    schema: pathInput.extend({
      direction: z.enum(["incoming", "outgoing"]),
      depth: z.number().int().min(1).max(10).default(2),
    }),
  },
);

export const getRouteTable = tool(
  async (input, runtime: ToolRuntime) => callRepositoryTool("routes", input, runtime),
  {
    name: "get_route_table",
    description:
      "Get the complete route table recovered by the framework adapter, with exact method, path, and source file. An empty result means no routes were recovered.",
    schema: emptyInput,
  },
);
