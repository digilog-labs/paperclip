import { companies, instanceSettings } from "@paperclipai/db";
import { DEFAULT_FEEDBACK_DATA_SHARING_PREFERENCE, DEFAULT_BACKUP_RETENTION, DEFAULT_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS, instanceGeneralSettingsSchema, instanceExperimentalSettingsSchema, } from "@paperclipai/shared";
import { eq } from "drizzle-orm";
const DEFAULT_SINGLETON_KEY = "default";
function normalizeGeneralSettings(raw) {
    const parsed = instanceGeneralSettingsSchema.safeParse(raw ?? {});
    if (parsed.success) {
        return {
            censorUsernameInLogs: parsed.data.censorUsernameInLogs ?? false,
            keyboardShortcuts: parsed.data.keyboardShortcuts ?? false,
            feedbackDataSharingPreference: parsed.data.feedbackDataSharingPreference ?? DEFAULT_FEEDBACK_DATA_SHARING_PREFERENCE,
            backupRetention: parsed.data.backupRetention ?? DEFAULT_BACKUP_RETENTION,
        };
    }
    return {
        censorUsernameInLogs: false,
        keyboardShortcuts: false,
        feedbackDataSharingPreference: DEFAULT_FEEDBACK_DATA_SHARING_PREFERENCE,
        backupRetention: DEFAULT_BACKUP_RETENTION,
    };
}
function normalizeExperimentalSettings(raw) {
    const parsed = instanceExperimentalSettingsSchema.safeParse(raw ?? {});
    if (parsed.success) {
        return {
            enableEnvironments: parsed.data.enableEnvironments ?? false,
            enableIsolatedWorkspaces: parsed.data.enableIsolatedWorkspaces ?? false,
            autoRestartDevServerWhenIdle: parsed.data.autoRestartDevServerWhenIdle ?? false,
            enableIssueGraphLivenessAutoRecovery: parsed.data.enableIssueGraphLivenessAutoRecovery ?? false,
            issueGraphLivenessAutoRecoveryLookbackHours: parsed.data.issueGraphLivenessAutoRecoveryLookbackHours ??
                DEFAULT_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS,
        };
    }
    return {
        enableEnvironments: false,
        enableIsolatedWorkspaces: false,
        autoRestartDevServerWhenIdle: false,
        enableIssueGraphLivenessAutoRecovery: false,
        issueGraphLivenessAutoRecoveryLookbackHours: DEFAULT_ISSUE_GRAPH_LIVENESS_AUTO_RECOVERY_LOOKBACK_HOURS,
    };
}
function toInstanceSettings(row) {
    return {
        id: row.id,
        general: normalizeGeneralSettings(row.general),
        experimental: normalizeExperimentalSettings(row.experimental),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
export function instanceSettingsService(db) {
    async function getOrCreateRow() {
        const existing = await db
            .select()
            .from(instanceSettings)
            .where(eq(instanceSettings.singletonKey, DEFAULT_SINGLETON_KEY))
            .then((rows) => rows[0] ?? null);
        if (existing)
            return existing;
        const now = new Date();
        const [created] = await db
            .insert(instanceSettings)
            .values({
            singletonKey: DEFAULT_SINGLETON_KEY,
            general: {},
            experimental: {},
            createdAt: now,
            updatedAt: now,
        })
            .onConflictDoUpdate({
            target: [instanceSettings.singletonKey],
            set: {
                updatedAt: now,
            },
        })
            .returning();
        if (created)
            return created;
        const raced = await db
            .select()
            .from(instanceSettings)
            .where(eq(instanceSettings.singletonKey, DEFAULT_SINGLETON_KEY))
            .then((rows) => rows[0] ?? null);
        if (raced)
            return raced;
        throw new Error("Failed to initialize instance settings row");
    }
    return {
        get: async () => toInstanceSettings(await getOrCreateRow()),
        getGeneral: async () => {
            const row = await getOrCreateRow();
            return normalizeGeneralSettings(row.general);
        },
        getExperimental: async () => {
            const row = await getOrCreateRow();
            return normalizeExperimentalSettings(row.experimental);
        },
        updateGeneral: async (patch) => {
            const current = await getOrCreateRow();
            const nextGeneral = normalizeGeneralSettings({
                ...normalizeGeneralSettings(current.general),
                ...patch,
            });
            const now = new Date();
            const [updated] = await db
                .update(instanceSettings)
                .set({
                general: { ...nextGeneral },
                updatedAt: now,
            })
                .where(eq(instanceSettings.id, current.id))
                .returning();
            return toInstanceSettings(updated ?? current);
        },
        updateExperimental: async (patch) => {
            const current = await getOrCreateRow();
            const nextExperimental = normalizeExperimentalSettings({
                ...normalizeExperimentalSettings(current.experimental),
                ...patch,
            });
            const now = new Date();
            const [updated] = await db
                .update(instanceSettings)
                .set({
                experimental: { ...nextExperimental },
                updatedAt: now,
            })
                .where(eq(instanceSettings.id, current.id))
                .returning();
            return toInstanceSettings(updated ?? current);
        },
        listCompanyIds: async () => db
            .select({ id: companies.id })
            .from(companies)
            .then((rows) => rows.map((row) => row.id)),
    };
}
//# sourceMappingURL=instance-settings.js.map