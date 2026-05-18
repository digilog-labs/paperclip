const SECRET_PROVIDER_CLIENT_ERROR_STATUS = {
    access_denied: 403,
    throttled: 429,
    not_found: 404,
    conflict: 409,
    invalid_request: 422,
    provider_unavailable: 503,
    provider_error: 502,
};
export class SecretProviderClientError extends Error {
    code;
    provider;
    operation;
    status;
    rawMessage;
    constructor(options) {
        super(options.message);
        this.name = "SecretProviderClientError";
        this.code = options.code;
        this.provider = options.provider;
        this.operation = options.operation;
        this.status = options.status ?? SECRET_PROVIDER_CLIENT_ERROR_STATUS[options.code];
        this.rawMessage = options.rawMessage ?? null;
        if (options.cause !== undefined) {
            Object.defineProperty(this, "cause", {
                value: options.cause,
                enumerable: false,
                configurable: true,
            });
        }
    }
}
export function isSecretProviderClientError(error) {
    return error instanceof SecretProviderClientError;
}
//# sourceMappingURL=types.js.map