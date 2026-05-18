/**
 * @fileoverview Adapter management REST API routes
 *
 * This module provides Express routes for managing external adapter plugins:
 * - Listing all registered adapters (built-in + external)
 * - Installing external adapters from npm packages or local paths
 * - Unregistering external adapters
 *
 * Read-only routes require board org access. Mutating adapter management
 * routes require instance-admin access because they can install, reload, or
 * toggle server-side adapter code for the whole Paperclip instance.
 *
 * @module server/routes/adapters
 */
export declare function adapterRoutes(): import("express-serve-static-core").Router;
//# sourceMappingURL=adapters.d.ts.map