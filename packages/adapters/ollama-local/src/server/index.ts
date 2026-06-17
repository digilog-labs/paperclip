import type { AdapterSessionCodec, ServerAdapterModule } from "@paperclipai/adapter-utils";
import { type, models, agentConfigurationDoc } from "../index.js";
import { execute } from "./execute.js";
import { testEnvironment } from "./test.js";
import { listOllamaModels } from "./models.js";

function readNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

export const sessionCodec: AdapterSessionCodec = {
  deserialize(raw: unknown) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
    const record = raw as Record<string, unknown>;
    if (!Array.isArray(record.messages)) return null;
    return { messages: record.messages };
  },
  serialize(params: Record<string, unknown> | null) {
    if (!params || !Array.isArray(params.messages)) return null;
    return { messages: params.messages };
  },
  getDisplayId(params: Record<string, unknown> | null) {
    if (!params || !Array.isArray(params.messages)) return null;
    return readNonEmptyString(String(params.messages.length) + " turns");
  },
};

export { execute } from "./execute.js";
export { testEnvironment } from "./test.js";
export { listOllamaModels } from "./models.js";

export function createServerAdapter(): ServerAdapterModule {
  return {
    type,
    execute,
    testEnvironment,
    sessionCodec,
    models,
    listModels: listOllamaModels,
    agentConfigurationDoc,
    supportsLocalAgentJwt: false,
    supportsInstructionsBundle: false,
    requiresMaterializedRuntimeSkills: false,
  };
}
