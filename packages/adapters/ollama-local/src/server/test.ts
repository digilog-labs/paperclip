import type {
  AdapterEnvironmentCheck,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
} from "@paperclipai/adapter-utils";
import { DEFAULT_OLLAMA_URL, DEFAULT_OLLAMA_MODEL } from "../index.js";

function cfgString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim().length > 0 ? v.trim() : undefined;
}

function summarizeStatus(checks: AdapterEnvironmentCheck[]): AdapterEnvironmentTestResult["status"] {
  if (checks.some((c) => c.level === "error")) return "fail";
  if (checks.some((c) => c.level === "warn")) return "warn";
  return "pass";
}

interface OllamaTagsResponse {
  models: Array<{ name: string; size?: number; details?: { parameter_size?: string } }>;
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const checks: AdapterEnvironmentCheck[] = [];
  const config = ctx.config as Record<string, unknown>;

  const ollamaUrl = cfgString(config.ollamaUrl) ?? DEFAULT_OLLAMA_URL;
  const model = cfgString(config.model) ?? DEFAULT_OLLAMA_MODEL;

  // 1. Check Ollama is reachable
  let tags: OllamaTagsResponse | null = null;
  try {
    const response = await fetch(`${ollamaUrl}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    tags = (await response.json()) as OllamaTagsResponse;
    checks.push({
      code: "ollama_reachable",
      level: "info",
      message: `Ollama is running at ${ollamaUrl}`,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    checks.push({
      code: "ollama_unreachable",
      level: "error",
      message: `Cannot reach Ollama at ${ollamaUrl}`,
      detail,
      hint: "Start Ollama with: ollama serve",
    });
    return {
      adapterType: ctx.adapterType,
      status: "fail",
      checks,
      testedAt: new Date().toISOString(),
    };
  }

  // 2. List installed models
  const installedModels = tags?.models ?? [];
  if (installedModels.length === 0) {
    checks.push({
      code: "ollama_no_models",
      level: "warn",
      message: "Ollama is running but no models are installed.",
      hint: `Install a model with: ollama pull ${model}`,
    });
  } else {
    const names = installedModels.map((m) => m.name).join(", ");
    checks.push({
      code: "ollama_models_found",
      level: "info",
      message: `${installedModels.length} model(s) installed: ${names}`,
    });
  }

  // 3. Check configured model is available
  if (installedModels.length > 0) {
    const modelInstalled = installedModels.some(
      (m) => m.name === model || m.name.startsWith(`${model}:`),
    );
    if (!modelInstalled) {
      checks.push({
        code: "ollama_model_missing",
        level: "warn",
        message: `Configured model "${model}" is not installed.`,
        hint: `Run: ollama pull ${model}`,
      });
    } else {
      checks.push({
        code: "ollama_model_ready",
        level: "info",
        message: `Model "${model}" is installed and ready.`,
      });
    }
  }

  // 4. Quick generate probe
  try {
    const probeRes = await fetch(`${ollamaUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages: [{ role: "user", content: "Reply with only the word: hello" }],
        stream: false,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!probeRes.ok) {
      const errText = await probeRes.text().catch(() => "");
      throw new Error(`HTTP ${probeRes.status}: ${errText}`);
    }

    const data = (await probeRes.json()) as { message?: { content?: string }; error?: string };
    if (data.error) throw new Error(data.error);

    const reply = (data.message?.content ?? "").toLowerCase();
    const passed = reply.includes("hello");
    checks.push({
      code: passed ? "ollama_probe_passed" : "ollama_probe_unexpected",
      level: passed ? "info" : "warn",
      message: passed
        ? `Model "${model}" responded correctly to hello probe.`
        : `Model "${model}" probe ran but response was unexpected.`,
      ...(reply ? { detail: reply.slice(0, 200) } : {}),
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    checks.push({
      code: "ollama_probe_failed",
      level: "warn",
      message: `Hello probe failed for model "${model}".`,
      detail,
      hint: `Verify manually: ollama run ${model} "Reply with only: hello"`,
    });
  }

  return {
    adapterType: ctx.adapterType,
    status: summarizeStatus(checks),
    checks,
    testedAt: new Date().toISOString(),
  };
}
