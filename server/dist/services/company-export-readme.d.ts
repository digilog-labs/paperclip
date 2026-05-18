/**
 * Generates README.md with Mermaid org chart for company exports.
 */
import type { CompanyPortabilityManifest } from "@paperclipai/shared";
/**
 * Generate a Mermaid flowchart (TD = top-down) representing the org chart.
 * Returns null if there are no agents.
 */
export declare function generateOrgChartMermaid(agents: CompanyPortabilityManifest["agents"]): string | null;
/**
 * Generate the README.md content for a company export.
 */
export declare function generateReadme(manifest: CompanyPortabilityManifest, options: {
    companyName: string;
    companyDescription: string | null;
}): string;
//# sourceMappingURL=company-export-readme.d.ts.map