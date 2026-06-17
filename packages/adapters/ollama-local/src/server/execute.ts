import type { AdapterExecutionContext, AdapterExecutionResult } from "@paperclipai/adapter-utils";
import { DEFAULT_OLLAMA_URL, DEFAULT_OLLAMA_MODEL, DEFAULT_TIMEOUT_SEC } from "../index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface OllamaMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

interface OllamaChatRequest {
  model: string;
  messages: OllamaMessage[];
  stream: boolean;
  keep_alive?: string;
}

interface OllamaChatChunk {
  model: string;
  created_at: string;
  message: { role: string; content: string };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  prompt_eval_count?: number;
  eval_count?: number;
}

// ---------------------------------------------------------------------------
// Config helpers
// ---------------------------------------------------------------------------

function cfgString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function cfgNumber(v: unknown, fallback: number): number {
  return typeof v === "number" && v > 0 ? v : fallback;
}

// ---------------------------------------------------------------------------
// Prompt builder
// ---------------------------------------------------------------------------

function buildSystemPrompt(ctx: AdapterExecutionContext, customSystemPrompt?: string): string {
  const agent = ctx.agent;
  const config = ctx.config as Record<string, unknown>;
  const context = ctx.context as Record<string, unknown>;

  const paperclipApiUrl =
    cfgString(config.paperclipApiUrl) ??
    (process.env.PAPERCLIP_API_URL ?? "http://127.0.0.1:3100/api");

  const basePrompt = [
    `You are "${agent.name}", an AI agent operating inside a Paperclip-managed company.`,
    "",
    "Your Paperclip identity:",
    `  Agent ID: ${agent.id}`,
    `  Company ID: ${agent.companyId}`,
    `  API Base: ${paperclipApiUrl}`,
    "",
    "IMPORTANT: Use curl for ALL Paperclip API calls.",
    `  Authorization: Bearer $PAPERCLIP_API_KEY`,
    `  Run ID header (for writes): X-Paperclip-Run-Id: ${ctx.runId}`,
  ].join("\n");

  const taskId = cfgString(String(context.taskId ?? ""));
  const taskTitle = cfgString(String(context.taskTitle ?? ""));
  const taskBody = cfgString(String(context.taskBody ?? ""));
  const wakeReason = cfgString(String(context.wakeReason ?? ""));

  const taskSection = taskId
    ? [
        "",
        "## Assigned Task",
        `Issue ID: ${taskId}`,
        taskTitle ? `Title: ${taskTitle}` : "",
        taskBody ? `\n${taskBody}` : "",
        "",
        "When done, mark complete:",
        `  curl -s -X PATCH "${paperclipApiUrl}/issues/${taskId}" \\`,
        `    -H "Authorization: Bearer $PAPERCLIP_API_KEY" \\`,
        `    -H "X-Paperclip-Run-Id: ${ctx.runId}" \\`,
        `    -H "Content-Type: application/json" \\`,
        `    -d '{"status":"done","comment":"Task completed."}'`,
      ]
        .filter(Boolean)
        .join("\n")
    : wakeReason
      ? `\n## Wake Reason\n${wakeReason}`
      : "\n## Heartbeat\nCheck for assigned work and continue.";

  const parts = [basePrompt, taskSection];
  if (customSystemPrompt) parts.push("\n## Additional Instructions\n" + customSystemPrompt);
  return parts.join("\n");
}

// ---------------------------------------------------------------------------
// Ollama streaming fetch
// ---------------------------------------------------------------------------

async function streamOllamaChat(
  ollamaUrl: string,
  request: OllamaChatRequest,
  timeoutSec: number,
  onToken: (token: string) => Promise<void>,
): Promise<{ content: string; promptTokens: number; completionTokens: number; timedOut: boolean }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);

  let content = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let timedOut = false;

  try {
    const response = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`Ollama API error ${response.status}: ${errText}`);
    }

    if (!response.body) throw new Error("Ollama returned empty response body");

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const chunk = JSON.parse(trimmed) as OllamaChatChunk;
          const token = chunk.message?.content ?? "";
          if (token) {
            content += token;
            await onToken(token);
          }
          if (chunk.done) {
            promptTokens = chunk.prompt_eval_count ?? 0;
            completionTokens = chunk.eval_count ?? 0;
          }
        } catch {
          // skip malformed lines
        }
      }
    }
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      timedOut = true;
    } else {
      throw err;
    }
  } finally {
    clearTimeout(timer);
  }

  return { content, promptTokens, completionTokens, timedOut };
}

// ---------------------------------------------------------------------------
// Main execute
// ---------------------------------------------------------------------------

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const config = ctx.config as Record<string, unknown>;
  const context = ctx.context as Record<string, unknown>;

  const ollamaUrl = cfgString(config.ollamaUrl) ?? DEFAULT_OLLAMA_URL;
  const model = cfgString(config.model) ?? DEFAULT_OLLAMA_MODEL;
  const timeoutSec = cfgNumber(config.timeoutSec, DEFAULT_TIMEOUT_SEC);
  const keepAlive = cfgString(config.keepAlive);
  const customSystemPrompt = cfgString(config.systemPrompt);

  // Restore previous messages from session
  const prevMessages: OllamaMessage[] = (() => {
    const params = ctx.runtime?.sessionParams;
    if (!params || !Array.isArray(params.messages)) return [];
    return params.messages as OllamaMessage[];
  })();

  const systemPrompt = buildSystemPrompt(ctx, customSystemPrompt);

  // Build user message from prompt template or task context
  const promptTemplate = cfgString(config.promptTemplate);
  const taskId = cfgString(String(context.taskId ?? ""));
  const userMessage = promptTemplate
    ? promptTemplate
        .replace(/\{\{agentId\}\}/g, ctx.agent.id)
        .replace(/\{\{agentName\}\}/g, ctx.agent.name)
        .replace(/\{\{companyId\}\}/g, ctx.agent.companyId)
        .replace(/\{\{runId\}\}/g, ctx.runId)
        .replace(/\{\{taskId\}\}/g, taskId ?? "")
        .replace(/\{\{wakeReason\}\}/g, cfgString(String(context.wakeReason ?? "")) ?? "")
    : taskId
      ? `Work on task ${taskId}. Read the issue details, complete the work, and update the issue status when done.`
      : "Check for assigned work and continue. If nothing is assigned, report your status briefly.";

  const messages: OllamaMessage[] = [
    // System prompt is always fresh (not persisted — regenerated each run with current context)
    { role: "system", content: systemPrompt },
    // Restore prior conversation turns
    ...prevMessages,
    // New user message for this heartbeat
    { role: "user", content: userMessage },
  ];

  await ctx.onLog("stdout", `[ollama] Model: ${model} | URL: ${ollamaUrl}\n`);
  await ctx.onLog("stdout", `[ollama] Starting response...\n`);

  const request: OllamaChatRequest = {
    model,
    messages,
    stream: true,
    ...(keepAlive ? { keep_alive: keepAlive } : {}),
  };

  let errorMessage: string | undefined;
  let assistantContent = "";
  let promptTokens = 0;
  let completionTokens = 0;
  let timedOut = false;

  try {
    const result = await streamOllamaChat(
      ollamaUrl,
      request,
      timeoutSec,
      async (token) => {
        await ctx.onLog("stdout", token);
      },
    );
    assistantContent = result.content;
    promptTokens = result.promptTokens;
    completionTokens = result.completionTokens;
    timedOut = result.timedOut;
  } catch (err) {
    errorMessage = err instanceof Error ? err.message : String(err);
    await ctx.onLog("stderr", `[ollama] Error: ${errorMessage}\n`);
  }

  await ctx.onLog("stdout", `\n[ollama] Done. Tokens: ${promptTokens} in / ${completionTokens} out\n`);

  // Persist conversation: prior turns + this exchange (excluding system prompt)
  const updatedMessages: OllamaMessage[] = [
    ...prevMessages,
    { role: "user", content: userMessage },
    ...(assistantContent ? [{ role: "assistant" as const, content: assistantContent }] : []),
  ];

  const sessionParams = assistantContent ? { messages: updatedMessages } : null;

  return {
    exitCode: errorMessage ? 1 : 0,
    signal: null,
    timedOut,
    ...(errorMessage ? { errorMessage } : {}),
    ...(promptTokens || completionTokens
      ? { usage: { inputTokens: promptTokens, outputTokens: completionTokens } }
      : {}),
    model,
    provider: "ollama",
    summary: assistantContent ? assistantContent.slice(0, 2000) : undefined,
    sessionParams,
    sessionDisplayId: sessionParams ? `${model}:${updatedMessages.length}turns` : null,
    resultJson: {
      result: assistantContent,
      model,
      turns: updatedMessages.length,
    },
  };
}
