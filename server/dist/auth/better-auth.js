import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { toNodeHandler } from "better-auth/node";
import { authAccounts, authSessions, authUsers, authVerifications, } from "@paperclipai/db";
import { resolvePaperclipInstanceId } from "../home-paths.js";
const AUTH_COOKIE_PREFIX_FALLBACK = "default";
const AUTH_COOKIE_PREFIX_INVALID_SEGMENTS_RE = /[^a-zA-Z0-9_-]+/g;
export function deriveAuthCookiePrefix(instanceId = resolvePaperclipInstanceId()) {
    const scopedInstanceId = instanceId
        .trim()
        .replace(AUTH_COOKIE_PREFIX_INVALID_SEGMENTS_RE, "-")
        .replace(/^-+|-+$/g, "") || AUTH_COOKIE_PREFIX_FALLBACK;
    return `paperclip-${scopedInstanceId}`;
}
export function buildBetterAuthAdvancedOptions(input) {
    return {
        cookiePrefix: deriveAuthCookiePrefix(),
        ...(input.disableSecureCookies ? { useSecureCookies: false } : {}),
    };
}
function headersFromNodeHeaders(rawHeaders) {
    const headers = new Headers();
    for (const [key, raw] of Object.entries(rawHeaders)) {
        if (!raw)
            continue;
        if (Array.isArray(raw)) {
            for (const value of raw)
                headers.append(key, value);
            continue;
        }
        headers.set(key, raw);
    }
    return headers;
}
function headersFromExpressRequest(req) {
    return headersFromNodeHeaders(req.headers);
}
export function deriveAuthTrustedOrigins(config, opts) {
    const baseUrl = config.authBaseUrlMode === "explicit" ? config.authPublicBaseUrl : undefined;
    const trustedOrigins = new Set();
    if (baseUrl) {
        try {
            trustedOrigins.add(new URL(baseUrl).origin);
        }
        catch {
            // Better Auth will surface invalid base URL separately.
        }
    }
    if (config.deploymentMode === "authenticated") {
        const port = opts?.listenPort ?? config.port;
        const needsPortVariants = port !== 80 && port !== 443;
        for (const hostname of config.allowedHostnames) {
            const trimmed = hostname.trim().toLowerCase();
            if (!trimmed)
                continue;
            trustedOrigins.add(`https://${trimmed}`);
            trustedOrigins.add(`http://${trimmed}`);
            if (needsPortVariants) {
                trustedOrigins.add(`https://${trimmed}:${port}`);
                trustedOrigins.add(`http://${trimmed}:${port}`);
            }
        }
    }
    return Array.from(trustedOrigins);
}
export function createBetterAuthInstance(db, config, trustedOrigins) {
    const baseUrl = config.authBaseUrlMode === "explicit" ? config.authPublicBaseUrl : undefined;
    const secret = process.env.BETTER_AUTH_SECRET ?? process.env.PAPERCLIP_AGENT_JWT_SECRET;
    if (!secret) {
        throw new Error("BETTER_AUTH_SECRET (or PAPERCLIP_AGENT_JWT_SECRET) must be set. " +
            "For local development, set BETTER_AUTH_SECRET=paperclip-dev-secret in your .env file.");
    }
    const publicUrl = process.env.PAPERCLIP_PUBLIC_URL ?? baseUrl;
    const isHttpOnly = publicUrl ? publicUrl.startsWith("http://") : false;
    const authConfig = {
        baseURL: baseUrl,
        secret,
        trustedOrigins,
        database: drizzleAdapter(db, {
            provider: "pg",
            schema: {
                user: authUsers,
                session: authSessions,
                account: authAccounts,
                verification: authVerifications,
            },
        }),
        emailAndPassword: {
            enabled: true,
            requireEmailVerification: false,
            disableSignUp: config.authDisableSignUp,
        },
        advanced: buildBetterAuthAdvancedOptions({ disableSecureCookies: isHttpOnly }),
    };
    if (!baseUrl) {
        delete authConfig.baseURL;
    }
    return betterAuth(authConfig);
}
export function createBetterAuthHandler(auth) {
    const handler = toNodeHandler(auth);
    return (req, res, next) => {
        void Promise.resolve(handler(req, res)).catch(next);
    };
}
export async function resolveBetterAuthSessionFromHeaders(auth, headers) {
    const api = auth.api;
    if (!api?.getSession)
        return null;
    const sessionValue = await api.getSession({
        headers,
    });
    if (!sessionValue || typeof sessionValue !== "object")
        return null;
    const value = sessionValue;
    const session = value.session?.id && value.session.userId
        ? { id: value.session.id, userId: value.session.userId }
        : null;
    const user = value.user?.id
        ? {
            id: value.user.id,
            email: value.user.email ?? null,
            name: value.user.name ?? null,
        }
        : null;
    if (!session || !user)
        return null;
    return { session, user };
}
export async function resolveBetterAuthSession(auth, req) {
    return resolveBetterAuthSessionFromHeaders(auth, headersFromExpressRequest(req));
}
//# sourceMappingURL=better-auth.js.map