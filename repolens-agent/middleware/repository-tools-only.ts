import { createMiddleware } from "langchain";

const repositoryToolNames = new Set([
  "get_analysis_summary",
  "search_files",
  "list_files_by_role",
  "get_file_neighbors",
  "walk_dependencies",
  "get_route_table",
]);

export const repositoryToolsOnly = createMiddleware({
  name: "RepositoryToolsOnly",
  wrapModelCall: (request, handler) =>
    handler({
      ...request,
      tools: request.tools.filter(
        (tool) => typeof tool.name === "string" && repositoryToolNames.has(tool.name),
      ),
    }),
});
