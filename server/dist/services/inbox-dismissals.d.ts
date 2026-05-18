import type { Db } from "@paperclipai/db";
export declare function inboxDismissalService(db: Db): {
    list: (companyId: string, userId: string) => Promise<{
        id: string;
        companyId: string;
        userId: string;
        itemKey: string;
        dismissedAt: Date;
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    dismiss: (companyId: string, userId: string, itemKey: string, dismissedAt?: Date) => Promise<{
        id: string;
        createdAt: Date;
        updatedAt: Date;
        companyId: string;
        userId: string;
        itemKey: string;
        dismissedAt: Date;
    }>;
};
//# sourceMappingURL=inbox-dismissals.d.ts.map