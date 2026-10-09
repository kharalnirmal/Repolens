import { defineDeepAgent } from "managed-deepagents";
import { z } from "zod";

import { repositoryToolsOnly } from "./middleware/repository-tools-only";
import {
  getAnalysisSummary,
  getFileNeighbors,
  getRouteTable,
  listFilesByRole,
  searchFiles,
  walkDependencies,
} from "./tools/repository";

export const contextSchema = z.object({
  analysisCredential: z.string().min(1),
});

export const agent = defineDeepAgent({
  name: "repolens-agent",
  model: "google-genai:gemini-3.5-flash-lite",
  contextSchema,
  middleware: [repositoryToolsOnly],
  tools: [
    getAnalysisSummary,
    searchFiles,
    listFilesByRole,
    getFileNeighbors,
    walkDependencies,
    getRouteTable,
  ],
});
