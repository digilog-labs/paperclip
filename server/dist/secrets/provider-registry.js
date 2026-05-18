import { awsSecretsManagerProvider } from "./aws-secrets-manager-provider.js";
import { localEncryptedProvider } from "./local-encrypted-provider.js";
import { gcpSecretManagerProvider, vaultProvider, } from "./external-stub-providers.js";
import { unprocessable } from "../errors.js";
const providers = [
    localEncryptedProvider,
    awsSecretsManagerProvider,
    gcpSecretManagerProvider,
    vaultProvider,
];
const providerById = new Map(providers.map((provider) => [provider.id, provider]));
export function getSecretProvider(id) {
    const provider = providerById.get(id);
    if (!provider)
        throw unprocessable(`Unsupported secret provider: ${id}`);
    return provider;
}
export function listSecretProviders() {
    return providers.map((provider) => provider.descriptor());
}
export async function checkSecretProviders() {
    return Promise.all(providers.map((provider) => provider.healthCheck()));
}
//# sourceMappingURL=provider-registry.js.map