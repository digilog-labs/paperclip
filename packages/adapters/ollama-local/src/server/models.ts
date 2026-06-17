import type { AdapterModel } from "@paperclipai/adapter-utils";
import { DEFAULT_OLLAMA_URL } from "../index.js";

interface OllamaModel {
  name: string;
  details?: { parameter_size?: string; family?: string };
}

function formatModelLabel(m: OllamaModel): string {
  const size = m.details?.parameter_size;
  return size ? `${m.name} (${size})` : m.name;
}

export async function listOllamaModels(ollamaUrl?: string): Promise<AdapterModel[]> {
  const url = ollamaUrl ?? process.env.OLLAMA_URL ?? DEFAULT_OLLAMA_URL;
  try {
    const response = await fetch(`${url}/api/tags`, {
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return [];
    const data = (await response.json()) as { models?: OllamaModel[] };
    if (!Array.isArray(data.models)) return [];
    return data.models.map((m) => ({
      id: m.name,
      label: formatModelLabel(m),
    }));
  } catch {
    return [];
  }
}
