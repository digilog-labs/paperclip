import { unprocessable } from "../errors.js";
function isGitHubDotCom(hostname) {
    const h = hostname.toLowerCase();
    return h === "github.com" || h === "www.github.com";
}
export function gitHubApiBase(hostname) {
    return isGitHubDotCom(hostname) ? "https://api.github.com" : `https://${hostname}/api/v3`;
}
export function resolveRawGitHubUrl(hostname, owner, repo, ref, filePath) {
    const p = filePath.replace(/^\/+/, "");
    return isGitHubDotCom(hostname)
        ? `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${p}`
        : `https://${hostname}/raw/${owner}/${repo}/${ref}/${p}`;
}
export async function ghFetch(url, init) {
    try {
        return await fetch(url, init);
    }
    catch {
        throw unprocessable(`Could not connect to ${new URL(url).hostname} — ensure the URL points to a GitHub or GitHub Enterprise instance`);
    }
}
//# sourceMappingURL=github-fetch.js.map