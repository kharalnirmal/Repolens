import { traceable } from "langsmith/traceable";

export interface InventedPathResult {
  score: 0 | 1;
  pathTokenCount: number;
  mentionedPaths: string[];
  inventedPaths: string[];
}

const pathWithDirectory = /(?:[A-Za-z0-9_@()[\]{}.+~-]+\/)+[A-Za-z0-9_@()[\]{}.+~-]*[A-Za-z0-9_@()[\]{}+~-]/gu;
const bareFileName = /(?<![A-Za-z0-9_./~-])(?:[a-z0-9_@()[\]{}+~-][A-Za-z0-9_@()[\]{}.+~-]*|[A-Z][A-Z0-9_@()[\]{}.+~-]*)\.(?:[cm]?[jt]sx?|json|mdx?|css|scss|sass|less|sql|ya?ml|toml|html?|vue|svelte|py|rb|go|rs|java|kt|swift|php|sh|graphql|gql)(?![A-Za-z0-9_~-]|\.[A-Za-z0-9])/gu;
const inlineCode = /`([^`\n]+)`/gu;
const fileName = /^[A-Za-z0-9_@()[\]{}+~-][A-Za-z0-9_@()[\]{}.+~-]*\.(?:[cm]?[jt]sx?|json|mdx?|css|scss|sass|less|sql|ya?ml|toml|html?|vue|svelte|py|rb|go|rs|java|kt|swift|php|sh|graphql|gql)$/u;
const filePath = /\.(?:[cm]?[jt]sx?|json|mdx?|css|scss|sass|less|sql|ya?ml|toml|html?|vue|svelte|py|rb|go|rs|java|kt|swift|php|sh|graphql|gql)$/u;

export function evaluateInventedPaths(
  explanation: string,
  shownToModel: readonly string[],
): InventedPathResult {
  const allowed = new Set(shownToModel);
  const codeTokens = [...explanation.matchAll(inlineCode)].map((match) => match[1]);
  const codeTokenSet = new Set(codeTokens);
  const directoryPaths = (explanation.match(pathWithDirectory) ?? []).filter(
    (token) => allowed.has(token) || filePath.test(token) || codeTokenSet.has(token),
  );
  const bareFiles = explanation.match(bareFileName) ?? [];
  const rootFiles = codeTokens.filter((token) => fileName.test(token));
  const tokens = [...new Set([...directoryPaths, ...bareFiles, ...rootFiles])].toSorted();
  const inventedPaths = tokens.filter((token) => !allowed.has(token));

  return {
    score: inventedPaths.length === 0 ? 1 : 0,
    pathTokenCount: tokens.length,
    mentionedPaths: tokens.filter((token) => allowed.has(token)),
    inventedPaths,
  };
}

export const evaluateInventedPathsLive = traceable(
  function evaluateInventedPathsLive(
    explanation: string,
    shownToModel: readonly string[],
  ): InventedPathResult {
    return evaluateInventedPaths(explanation, shownToModel);
  },
  {
    name: "invented-path-check",
    project_name: process.env.LANGSMITH_PROJECT,
  },
);
