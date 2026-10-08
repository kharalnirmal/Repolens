import { explanationModel, getAIClient } from "./client.ts";

export const explanationPromptVersion = "explanation-v2";

export interface ExplanationPromptInput {
  target: { kind: "file" | "folder"; path: string };
  files: Array<{ path: string; content: string }>;
  neighbors: Array<{ path: string; content: string }>;
  imports: Array<{ from: string; to: string }>;
}

export function currentExplanationPrompt(
  kind: ExplanationPromptInput["target"]["kind"],
): string {
  const question = kind === "file"
    ? "Explain what the target file does in the context of every direct file it imports and every direct file importing it."
    : "Explain what is in the target folder and why other files point at it. Treat the folder as the subject, not one representative file.";

  return `${question}

Use only facts in the supplied JSON. Never infer an import or name a repository path that was not supplied. When naming a file, copy its complete supplied path exactly; do not shorten it to a basename. Ground each claim in concrete code or an import shown in the input, and prefer specific responsibilities over generic summaries. Be concise and useful to a developer reading unfamiliar code.

The only permitted formatting is **bold**, \`inline code\`, and bullet lines beginning with "- ". Do not use headings, links, tables, fenced code, or other Markdown.`;
}

export async function generateExplanation(
  input: ExplanationPromptInput,
  prompt = currentExplanationPrompt(input.target.kind),
): Promise<string> {
  const completion = await getAIClient().chat.completions.create({
    model: explanationModel,
    temperature: 0.2,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: JSON.stringify(input) },
    ],
  });
  const content = completion.choices[0]?.message.content?.trim();
  if (!content) throw new Error("The model returned an empty explanation");
  return content;
}
