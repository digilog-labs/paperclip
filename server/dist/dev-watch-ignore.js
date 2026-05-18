import fs from "node:fs";
import path from "node:path";
function toGlobstarPath(candidate) {
    return `${candidate.replaceAll(path.sep, "/")}/**`;
}
function addIgnorePath(target, candidate) {
    target.add(candidate);
    target.add(toGlobstarPath(candidate));
    try {
        const realPath = fs.realpathSync(candidate);
        target.add(realPath);
        target.add(toGlobstarPath(realPath));
    }
    catch {
        // Ignore paths that do not exist in the current checkout.
    }
}
export function resolveServerDevWatchIgnorePaths(serverRoot) {
    const ignorePaths = new Set([
        "**/{node_modules,bower_components,vendor}/**",
        "**/.vite-temp/**",
    ]);
    for (const relativePath of [
        "../ui/node_modules",
        "../ui/node_modules/.vite-temp",
        "../ui/.vite",
        "../ui/dist",
        // npm install during reinstall would trigger a restart mid-request
        // if tsx watch sees the new files. Exclude the managed plugins dir.
        process.env.HOME + "/.paperclip/adapter-plugins",
    ]) {
        addIgnorePath(ignorePaths, path.resolve(serverRoot, relativePath));
    }
    return [...ignorePaths];
}
//# sourceMappingURL=dev-watch-ignore.js.map