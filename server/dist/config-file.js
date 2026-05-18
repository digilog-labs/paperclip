import fs from "node:fs";
import { paperclipConfigSchema } from "@paperclipai/shared";
import { resolvePaperclipConfigPath } from "./paths.js";
export function readConfigFile() {
    const configPath = resolvePaperclipConfigPath();
    if (!fs.existsSync(configPath))
        return null;
    try {
        const raw = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        return paperclipConfigSchema.parse(raw);
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=config-file.js.map