declare const DEFAULT_AGENT_BUNDLE_FILES: {
    readonly default: readonly ["AGENTS.md"];
    readonly ceo: readonly ["AGENTS.md", "HEARTBEAT.md", "SOUL.md", "TOOLS.md"];
};
type DefaultAgentBundleRole = keyof typeof DEFAULT_AGENT_BUNDLE_FILES;
export declare function loadDefaultAgentInstructionsBundle(role: DefaultAgentBundleRole): Promise<Record<string, string>>;
export declare function resolveDefaultAgentInstructionsBundleRole(role: string): DefaultAgentBundleRole;
export {};
//# sourceMappingURL=default-agent-instructions.d.ts.map