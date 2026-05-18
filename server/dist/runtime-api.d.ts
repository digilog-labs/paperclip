import os from "node:os";
export declare function choosePrimaryRuntimeApiUrl(input: {
    authPublicBaseUrl?: string | null;
    allowedHostnames: string[];
    bindHost: string;
    port: number;
}): string;
export declare function collectReachableInterfaceHosts(input?: {
    networkInterfacesMap?: NodeJS.Dict<os.NetworkInterfaceInfo[]>;
}): string[];
export declare function buildRuntimeApiCandidateUrls(input: {
    preferredApiUrl?: string | null;
    authPublicBaseUrl?: string | null;
    allowedHostnames: string[];
    bindHost: string;
    port: number;
    networkInterfacesMap?: NodeJS.Dict<os.NetworkInterfaceInfo[]>;
}): string[];
//# sourceMappingURL=runtime-api.d.ts.map