/**
 * Server-side SVG renderer for Paperclip org charts.
 * Supports 5 visual styles: monochrome, nebula, circuit, warmth, schematic.
 * Pure SVG output — no browser/Playwright needed. PNG via sharp.
 */
export interface OrgNode {
    id: string;
    name: string;
    role: string;
    status: string;
    reports: OrgNode[];
    /** Populated by collapseTree: the flattened list of hidden descendants for avatar grid rendering. */
    collapsedReports?: OrgNode[];
}
export type OrgChartStyle = "monochrome" | "nebula" | "circuit" | "warmth" | "schematic";
export declare const ORG_CHART_STYLES: OrgChartStyle[];
export interface OrgChartOverlay {
    /** Company name displayed top-left */
    companyName?: string;
    /** Summary stats displayed bottom-right, e.g. "Agents: 5, Skills: 8" */
    stats?: string;
}
export declare function renderOrgChartSvg(orgTree: OrgNode[], style?: OrgChartStyle, overlay?: OrgChartOverlay): string;
export declare function renderOrgChartPng(orgTree: OrgNode[], style?: OrgChartStyle, overlay?: OrgChartOverlay): Promise<Buffer>;
//# sourceMappingURL=org-chart-svg.d.ts.map