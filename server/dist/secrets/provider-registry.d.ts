import type { SecretProvider, SecretProviderDescriptor } from "@paperclipai/shared";
import type { SecretProviderHealthCheck, SecretProviderModule } from "./types.js";
export declare function getSecretProvider(id: SecretProvider): SecretProviderModule;
export declare function listSecretProviders(): SecretProviderDescriptor[];
export declare function checkSecretProviders(): Promise<SecretProviderHealthCheck[]>;
//# sourceMappingURL=provider-registry.d.ts.map