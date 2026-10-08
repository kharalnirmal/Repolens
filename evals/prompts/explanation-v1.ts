import type { ExplanationPromptInput } from "../../lib/ai/explanation-core.ts";

// This was the production prompt before explanation-v2. It stays here so dead
// prompt text never ships with the application bundle.
export function retiredExplanationPrompt(
  kind: ExplanationPromptInput["target"]["kind"],
): string {
  const question = kind === "file"
    ? "Explain what the target file does in the context of every direct file it imports and every direct file importing it."
    : "Explain what is in the target folder and why other files point at it. Treat the folder as the subject, not one representative file.";

  return `${question}

Use only facts in the supplied JSON. Never infer an import or name a repository path that was not supplied. Be concise and useful to a developer reading unfamiliar code.

The only permitted formatting is **bold**, \`inline code\`, and bullet lines beginning with "- ". Do not use headings, links, tables, fenced code, or other Markdown.`;
}
