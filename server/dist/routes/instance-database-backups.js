import { Router } from "express";
import { assertInstanceAdmin } from "./authz.js";
export function instanceDatabaseBackupRoutes(service) {
    const router = Router();
    router.post("/instance/database-backups", async (req, res) => {
        assertInstanceAdmin(req);
        const result = await service.runManualBackup();
        res.status(201).json(result);
    });
    return router;
}
//# sourceMappingURL=instance-database-backups.js.map