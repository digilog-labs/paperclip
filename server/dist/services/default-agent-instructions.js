import fs from "node:fs/promises";
const DEFAULT_AGENT_BUNDLE_FILES = {
    default: ["AGENTS.md"],
    ceo: ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"],
};
function resolveDefaultAgentBundleUrl(role, fileName) {
    return new URL(`../onboarding-assets/${role}/${fileName}`, import.meta.url);
}
export async function loadDefaultAgentInstructionsBundle(role) {
    const fileNames = DEFAULT_AGENT_BUNDLE_FILES[role];
    const entries = await Promise.all(fileNames.map(async (fileName) => {
        const content = await fs.readFile(resolveDefaultAgentBundleUrl(role, fileName), "utf8");
        return [fileName, content];
    }));
    return Object.fromEntries(entries);
}
export function resolveDefaultAgentInstructionsBundleRole(role) {
    return role === "ceo" ? "ceo" : "default";
}
//# sourceMappingURL=default-agent-instructions.js.map