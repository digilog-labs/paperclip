const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuidSecretRef(value) {
    return UUID_RE.test(value);
}
export function collectSecretRefPaths(schema) {
    const paths = new Set();
    if (!schema || typeof schema !== "object")
        return paths;
    function walk(node, prefix) {
        for (const keyword of ["allOf", "anyOf", "oneOf"]) {
            const branches = node[keyword];
            if (!Array.isArray(branches))
                continue;
            for (const branch of branches) {
                if (!branch || typeof branch !== "object" || Array.isArray(branch))
                    continue;
                walk(branch, prefix);
            }
        }
        const properties = node.properties;
        if (!properties || typeof properties !== "object")
            return;
        for (const [key, propertySchema] of Object.entries(properties)) {
            if (!propertySchema || typeof propertySchema !== "object")
                continue;
            const path = prefix ? `${prefix}.${key}` : key;
            if (propertySchema.format === "secret-ref") {
                paths.add(path);
            }
            walk(propertySchema, path);
        }
    }
    walk(schema, "");
    return paths;
}
export function readConfigValueAtPath(config, dotPath) {
    let current = config;
    for (const key of dotPath.split(".")) {
        if (!current || typeof current !== "object" || Array.isArray(current)) {
            return undefined;
        }
        current = current[key];
    }
    return current;
}
export function writeConfigValueAtPath(config, dotPath, value) {
    const result = structuredClone(config);
    const keys = dotPath.split(".");
    let cursor = result;
    for (let index = 0; index < keys.length - 1; index += 1) {
        const key = keys[index];
        const next = cursor[key];
        if (!next || typeof next !== "object" || Array.isArray(next)) {
            cursor[key] = {};
        }
        cursor = cursor[key];
    }
    const leafKey = keys[keys.length - 1];
    if (value === undefined) {
        delete cursor[leafKey];
    }
    else {
        cursor[leafKey] = value;
    }
    return result;
}
//# sourceMappingURL=json-schema-secret-refs.js.map