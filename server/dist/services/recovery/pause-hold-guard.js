import { issueTreeControlService } from "../issue-tree-control.js";
export async function isAutomaticRecoverySuppressedByPauseHold(db, companyId, issueId, treeControlSvc = issueTreeControlService(db)) {
    const activePauseHold = await treeControlSvc.getActivePauseHoldGate(companyId, issueId);
    return Boolean(activePauseHold);
}
//# sourceMappingURL=pause-hold-guard.js.map