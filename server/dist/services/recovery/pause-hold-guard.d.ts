import type { Db } from "@paperclipai/db";
import { issueTreeControlService } from "../issue-tree-control.js";
type IssueTreeControlService = ReturnType<typeof issueTreeControlService>;
export declare function isAutomaticRecoverySuppressedByPauseHold(db: Db, companyId: string, issueId: string, treeControlSvc?: IssueTreeControlService): Promise<boolean>;
export {};
//# sourceMappingURL=pause-hold-guard.d.ts.map