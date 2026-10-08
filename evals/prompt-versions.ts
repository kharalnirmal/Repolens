import type { EvaluationResult } from "langsmith/evaluation";
import type { ComparisonEvaluationResult } from "langsmith/schemas";

import type { ExplanationPromptInput } from "../lib/ai/explanation-core.ts";
import { loadScriptEnvironment } from "./load-env.ts";

loadScriptEnvironment();

const { Client } = await import("langsmith");
const { evaluate, evaluateComparative } = await import("langsmith/evaluation");
const { explanationModel, getAIClient } = await import("../lib/ai/client.ts");
const {
  currentExplanationPrompt,
  explanationPromptVersion,
  generateExplanation,
} = await import("../lib/ai/explanation-core.ts");
const { retiredExplanationPrompt } = await import("./prompts/explanation-v1.ts");
const { createEvalDatabaseClient } = await import("./database.ts");

const caseCount = readCaseCount();
const cases = await loadRecentExplanationCases(caseCount);
if (cases.length < 2) {
  throw new Error(`Prompt comparison requires at least two real explanation cases; found ${cases.length}`);
}

const client = new Client();
const timestamp = new Date().toISOString().replaceAll(":", "-");
const datasetName = `repolens-explanations-${timestamp}`;
const dataset = await client.createDataset(datasetName, {
  description: "Real explanation contexts reconstructed from recent RepoLens traffic.",
});
await client.createExamples(
  cases.map((input) => ({
    dataset_id: dataset.id,
    inputs: input,
  })),
);

console.log(
  "Usefulness is scored by a model judge, not an exact check; read the judge comments before treating the number as evidence.",
);

const current = await runExperiment(
  explanationPromptVersion,
  (input) => currentExplanationPrompt(input.target.kind),
);
const retired = await runExperiment(
  "explanation-v1-retired",
  (input) => retiredExplanationPrompt(input.target.kind),
);
const comparison = await evaluateComparative([current.result, retired.result], {
  client,
  experimentPrefix: "repolens-explanation-prompt-comparison",
  description: "Model-judged pairwise preference; this is subjective, not exact ground truth.",
  evaluators: [pairwiseUsefulnessJudge],
  randomizeOrder: true,
  maxConcurrency: 2,
});

const difference = current.mean - retired.mean;
console.log(`${explanationPromptVersion}: ${current.mean.toFixed(2)}/5`);
console.log(`explanation-v1-retired: ${retired.mean.toFixed(2)}/5`);
console.log(`Difference: ${difference >= 0 ? "+" : ""}${difference.toFixed(2)} points`);
console.log(`LangSmith comparison: ${comparison.url ?? comparison.experimentName}`);

async function runExperiment(
  version: string,
  promptFor: (input: ExplanationPromptInput) => string,
) {
  const result = await evaluate(
    async (input: ExplanationPromptInput) => ({
      explanation: await generateExplanation(input, promptFor(input)),
    }),
    {
      client,
      data: datasetName,
      experimentPrefix: `repolens-${version}`,
      description: `${version}, scored for specificity and usefulness by a model judge.`,
      evaluators: [usefulnessJudge],
      maxConcurrency: 2,
      metadata: { model: explanationModel, promptVersion: version },
    },
  );

  for await (const row of result) {
    // Exhausting the stream guarantees all predictions and judge calls are stored.
    void row;
  }
  const scores = result.results.flatMap((row) =>
    row.evaluationResults.results.flatMap((evaluation) =>
      evaluation.key === "usefulness" && typeof evaluation.score === "number"
        ? [evaluation.score]
        : [],
    ),
  );
  if (scores.length !== cases.length) {
    throw new Error(`${version} produced ${scores.length} judge scores for ${cases.length} cases`);
  }
  return {
    result,
    mean: scores.reduce((sum, score) => sum + score, 0) / scores.length,
  };
}

async function usefulnessJudge({
  inputs,
  outputs,
}: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
}): Promise<EvaluationResult> {
  const explanation = readExplanation(outputs);
  const judgement = await judge({
    task: "Score the explanation from 1 to 5 for how specific and useful it is to a developer reading unfamiliar code. Claims must be grounded in the supplied context. A generic summary scores low. Return a short reason.",
    context: inputs,
    explanation,
  });
  return {
    key: "usefulness",
    score: judgement.score,
    comment: judgement.reason,
  };
}

async function pairwiseUsefulnessJudge({
  runs,
  inputs,
  outputs,
}: {
  runs: Array<{ id: string }>;
  inputs: Record<string, unknown>;
  outputs: Array<Record<string, unknown>>;
}): Promise<ComparisonEvaluationResult> {
  if (runs.length !== 2 || outputs.length !== 2) {
    throw new Error("Prompt comparison expected exactly two experiment outputs");
  }
  const completion = await getAIClient().chat.completions.create({
    model: explanationModel,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "prompt_preference",
        strict: true,
        schema: {
          type: "object",
          properties: {
            winner: { type: "string", enum: ["first", "second", "tie"] },
          },
          required: ["winner"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "system",
        content: "Choose the explanation that is more specific and useful to a developer while remaining grounded in the supplied context. Prefer a tie when the practical difference is negligible.",
      },
      {
        role: "user",
        content: JSON.stringify({
          context: inputs,
          first: readExplanation(outputs[0]),
          second: readExplanation(outputs[1]),
        }),
      },
    ],
  });
  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("The pairwise judge returned no result");
  const parsed: unknown = JSON.parse(content);
  const winner = readWinner(parsed);
  return {
    key: "preferred",
    scores: {
      [runs[0].id]: winner === "first" ? 1 : winner === "tie" ? 0.5 : 0,
      [runs[1].id]: winner === "second" ? 1 : winner === "tie" ? 0.5 : 0,
    },
  };
}

async function judge(value: Record<string, unknown>): Promise<{ score: number; reason: string }> {
  const completion = await getAIClient().chat.completions.create({
    model: explanationModel,
    temperature: 0,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "explanation_usefulness",
        strict: true,
        schema: {
          type: "object",
          properties: {
            score: { type: "integer", minimum: 1, maximum: 5 },
            reason: { type: "string" },
          },
          required: ["score", "reason"],
          additionalProperties: false,
        },
      },
    },
    messages: [
      {
        role: "system",
        content: "Apply the supplied rubric consistently. Judge only from the supplied repository context. Return JSON.",
      },
      { role: "user", content: JSON.stringify(value) },
    ],
  });
  const content = completion.choices[0]?.message.content;
  if (!content) throw new Error("The usefulness judge returned no result");
  const parsed: unknown = JSON.parse(content);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    !("score" in parsed) ||
    !("reason" in parsed) ||
    typeof parsed.score !== "number" ||
    !Number.isInteger(parsed.score) ||
    parsed.score < 1 ||
    parsed.score > 5 ||
    typeof parsed.reason !== "string"
  ) {
    throw new Error("The usefulness judge returned invalid JSON");
  }
  return { score: parsed.score, reason: parsed.reason };
}

async function loadRecentExplanationCases(limit: number): Promise<ExplanationPromptInput[]> {
  const database = createEvalDatabaseClient();
  const { data: explanations, error: explanationError } = await database
    .from("explanations")
    .select("analysis_id, file_id, folder_path")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (explanationError) throw explanationError;
  if (explanations.length === 0) return [];

  const analysisIds = [...new Set(explanations.map((item) => item.analysis_id))];
  const [{ data: files, error: fileError }, { data: edges, error: edgeError }] = await Promise.all([
    database
      .from("files")
      .select("analysis_id, id, path, content")
      .in("analysis_id", analysisIds)
      .limit(5000),
    database
      .from("edges")
      .select("analysis_id, source_file_id, target_file_id")
      .in("analysis_id", analysisIds)
      .limit(10000),
  ]);
  if (fileError) throw fileError;
  if (edgeError) throw edgeError;
  if (files.length === 5000 || edges.length === 10000) {
    throw new Error("Prompt dataset hit its safety row limit; refusing to evaluate incomplete contexts");
  }

  return explanations.flatMap((explanation) => {
    const analysisFiles = files.filter((file) => file.analysis_id === explanation.analysis_id);
    const byId = new Map(analysisFiles.map((file) => [file.id, file]));
    const target = explanation.file_id
      ? byId.get(explanation.file_id)
        ? { kind: "file" as const, path: byId.get(explanation.file_id)!.path }
        : null
      : explanation.folder_path
        ? { kind: "folder" as const, path: explanation.folder_path }
        : null;
    if (!target) return [];

    const targetFiles = target.kind === "file"
      ? analysisFiles.filter((file) => file.path === target.path)
      : analysisFiles.filter((file) => inFolder(file.path, target.path));
    if (targetFiles.length === 0) return [];

    const targetIds = new Set(targetFiles.map((file) => file.id));
    const relevantEdges = edges.filter(
      (edge) =>
        edge.analysis_id === explanation.analysis_id &&
        (targetIds.has(edge.source_file_id) || targetIds.has(edge.target_file_id)),
    );
    const availablePaths = new Set(targetFiles.map((file) => file.path));
    for (const edge of relevantEdges) {
      const source = byId.get(edge.source_file_id);
      const destination = byId.get(edge.target_file_id);
      if (source) availablePaths.add(source.path);
      if (destination) availablePaths.add(destination.path);
    }
    const targetPaths = new Set(targetFiles.map((file) => file.path));
    const neighbors = analysisFiles.filter(
      (file) => availablePaths.has(file.path) && !targetPaths.has(file.path),
    );

    return [{
      target,
      files: targetFiles.map((file) => ({ path: file.path, content: file.content })),
      neighbors: neighbors.map((file) => ({ path: file.path, content: file.content })),
      imports: relevantEdges.flatMap((edge) => {
        const from = byId.get(edge.source_file_id)?.path;
        const to = byId.get(edge.target_file_id)?.path;
        return from && to ? [{ from, to }] : [];
      }),
    }];
  });
}

function readExplanation(output: Record<string, unknown>): string {
  const value = output.explanation;
  if (typeof value !== "string" || !value.trim()) {
    throw new Error("Experiment output did not contain an explanation");
  }
  return value;
}

function readWinner(value: unknown): "first" | "second" | "tie" {
  if (
    value &&
    typeof value === "object" &&
    "winner" in value &&
    (value.winner === "first" || value.winner === "second" || value.winner === "tie")
  ) {
    return value.winner;
  }
  throw new Error("The pairwise judge returned invalid JSON");
}

function readCaseCount(): number {
  const argument = process.argv.find((value) => value.startsWith("--size="));
  const parsed = Number(argument?.slice("--size=".length) ?? 8);
  if (!Number.isInteger(parsed) || parsed < 2 || parsed > 20) {
    throw new Error("--size must be an integer from 2 to 20");
  }
  return parsed;
}

function inFolder(filePath: string, folderPath: string): boolean {
  return folderPath === "." || filePath.startsWith(`${folderPath}/`);
}
