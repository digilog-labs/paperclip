import { SECRET_PROVIDERS } from "@paperclipai/shared";
export function getConfiguredSecretProvider() {
    const configuredProvider = process.env.PAPERCLIP_SECRETS_PROVIDER;
    return configuredProvider && SECRET_PROVIDERS.includes(configuredProvider)
        ? configuredProvider
        : "local_encrypted";
}
//# sourceMappingURL=configured-provider.js.map