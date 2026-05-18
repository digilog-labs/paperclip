export declare function isUuidSecretRef(value: string): boolean;
export declare function collectSecretRefPaths(schema: Record<string, unknown> | null | undefined): Set<string>;
export declare function readConfigValueAtPath(config: Record<string, unknown>, dotPath: string): unknown;
export declare function writeConfigValueAtPath(config: Record<string, unknown>, dotPath: string, value: unknown): Record<string, unknown>;
//# sourceMappingURL=json-schema-secret-refs.d.ts.map