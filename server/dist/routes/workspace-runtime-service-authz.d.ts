import type { Db } from "@paperclipai/db";
import type { Request } from "express";
export declare function assertCanManageProjectWorkspaceRuntimeServices(db: Db, req: Request, input: {
    companyId: string;
    projectWorkspaceId: string;
}): Promise<void>;
export declare function assertCanManageExecutionWorkspaceRuntimeServices(db: Db, req: Request, input: {
    companyId: string;
    executionWorkspaceId: string;
    sourceIssueId?: string | null;
}): Promise<void>;
//# sourceMappingURL=workspace-runtime-service-authz.d.ts.map