import type { AdapterConfigSchema } from "@paperclipai/adapter-utils";
import { DEFAULT_OLLAMA_URL, DEFAULT_OLLAMA_MODEL, DEFAULT_TIMEOUT_SEC } from "../index.js";

export function getConfigSchema(): AdapterConfigSchema {
  return {
    fields: [
      {
        key: "ollamaUrl",
        label: "Ollama URL",
        type: "text",
        default: DEFAULT_OLLAMA_URL,
        hint: `Ollama server URL. Defaults to ${DEFAULT_OLLAMA_URL}`,
      },
      {
        key: "model",
        label: "Model",
        type: "text",
        default: DEFAULT_OLLAMA_MODEL,
        hint: `Model name as shown in \`ollama list\`. Defaults to ${DEFAULT_OLLAMA_MODEL}`,
      },
      {
        key: "systemPrompt",
        label: "System prompt",
        type: "textarea",
        hint: "Optional custom system prompt prefix appended to the Paperclip context injection.",
      },
      {
        key: "promptTemplate",
        label: "Prompt template",
        type: "textarea",
        hint: "Optional task prompt template. Supports {{agentId}}, {{agentName}}, {{companyId}}, {{runId}}, {{taskId}}, {{wakeReason}} placeholders.",
      },
      {
        key: "keepAlive",
        label: "Keep alive",
        type: "text",
        hint: "How long to keep the model loaded in memory after the request (e.g. \"5m\", \"1h\", \"-1\" for forever). Defaults to Ollama's built-in TTL.",
      },
      {
        key: "timeoutSec",
        label: "Timeout (seconds)",
        type: "number",
        default: DEFAULT_TIMEOUT_SEC,
        hint: `Request timeout in seconds. Defaults to ${DEFAULT_TIMEOUT_SEC}.`,
      },
    ],
  };
}
