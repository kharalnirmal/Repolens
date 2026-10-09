export interface ChatHistoryMessage {
  role: "user" | "assistant";
  text: string;
}

export interface AgentChatRequest {
  message: string;
  selectedPath: string | null;
  history: ChatHistoryMessage[];
}

const maxQuestionLength = 4000;
const maxSelectedPathLength = 500;
const maxHistoryMessages = 12;
const maxHistoryMessageLength = 4000;
const maxHistoryLength = 24_000;

export class ChatRequestError extends Error {}

export function readChatRequest(body: unknown): AgentChatRequest {
  if (!isRecord(body)) throw new ChatRequestError("Request body must be a JSON object");

  const message = readRequiredText(body.message, "message", maxQuestionLength);
  const selectedPath = readSelectedPath(body.selectedPath);
  if (!Array.isArray(body.history)) {
    throw new ChatRequestError("history must be an array");
  }
  if (body.history.length > maxHistoryMessages) {
    throw new ChatRequestError(`history must contain at most ${maxHistoryMessages} messages`);
  }

  let totalLength = 0;
  const history = body.history.map<ChatHistoryMessage>((value, index) => {
    if (!isRecord(value) || (value.role !== "user" && value.role !== "assistant")) {
      throw new ChatRequestError(
        `history[${index}].role must be user or assistant`,
      );
    }
    const role = value.role === "user" ? "user" : "assistant";
    const rawTextLength =
      typeof value.text === "string" ? value.text.length : 0;
    const text = readRequiredText(
      value.text,
      `history[${index}].text`,
      maxHistoryMessageLength,
    );
    totalLength += rawTextLength;
    return { role, text };
  });

  if (totalLength > maxHistoryLength) {
    throw new ChatRequestError(
      `history text must contain at most ${maxHistoryLength} characters`,
    );
  }

  return { message, selectedPath, history };
}

function readSelectedPath(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  return readRequiredText(value, "selectedPath", maxSelectedPathLength);
}

function readRequiredText(value: unknown, name: string, maxLength: number): string {
  if (typeof value !== "string") {
    throw new ChatRequestError(`${name} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new ChatRequestError(`${name} must contain at most ${maxLength} characters`);
  }
  const text = value.trim();
  if (!text) {
    throw new ChatRequestError(`${name} must be a non-empty string`);
  }
  return text;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
