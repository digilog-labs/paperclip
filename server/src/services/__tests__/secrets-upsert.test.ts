import { randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { eq } from "drizzle-orm";
import {
  agents,
  companies,
  companySecretBindings,
  companySecretProviderConfigs,
  companySecretVersions,
  companySecrets,
  createDb,
  secretAccessEvents,
} from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "../../__tests__/helpers/embedded-postgres.js";
import { secretService } from "../secrets.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported
  ? describe
  : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping upsertSecretByName tests on this host: ${
      embeddedPostgresSupport.reason ?? "unsupported environment"
    }`,
  );
}

describeEmbeddedPostgres("secretService.upsertSecretByName (real db)", () => {
  let stopDb: (() => Promise<void>) | null = null;
  let db!: ReturnType<typeof createDb>;
  const previousKeyFile = process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE;
  const secretsTmpDir = path.join(
    os.tmpdir(),
    `paperclip-secrets-upsert-${randomUUID()}`,
  );

  beforeAll(async () => {
    mkdirSync(secretsTmpDir, { recursive: true });
    process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE = path.join(
      secretsTmpDir,
      "master.key",
    );
    const started = await startEmbeddedPostgresTestDatabase("secrets-upsert");
    stopDb = started.cleanup;
    db = createDb(started.connectionString);
  });

  afterEach(async () => {
    await db.delete(secretAccessEvents);
    await db.delete(companySecretBindings);
    await db.delete(companySecretVersions);
    await db.delete(companySecrets);
    await db.delete(companySecretProviderConfigs);
    await db.delete(agents);
    await db.delete(companies);
  });

  afterAll(async () => {
    await stopDb?.();
    if (previousKeyFile === undefined) {
      delete process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE;
    } else {
      process.env.PAPERCLIP_SECRETS_MASTER_KEY_FILE = previousKeyFile;
    }
    rmSync(secretsTmpDir, { recursive: true, force: true });
  });

  async function seedCompany(name = "Acme") {
    const companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name,
      issuePrefix: `T${companyId.slice(0, 7)}`.toUpperCase(),
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return companyId;
  }

  it("creates a new secret when no existing secret with that name", async () => {
    const companyId = await seedCompany();
    const svc = secretService(db);
    const name = `oauth:test:abc:access-${randomUUID()}`;
    const secret = await svc.upsertSecretByName(companyId, {
      name,
      value: "v1",
    });
    expect(secret.id).toBeTruthy();
    expect(secret.name).toBe(name);
    expect(secret.status).toBe("active");
    expect(secret.latestVersion).toBe(1);
  });

  it("rotates an existing active secret in place (same id, bumped version)", async () => {
    const companyId = await seedCompany();
    const svc = secretService(db);
    const name = `oauth:test:def:access-${randomUUID()}`;
    const created = await svc.upsertSecretByName(companyId, {
      name,
      value: "v1",
    });
    const rotated = await svc.upsertSecretByName(companyId, {
      name,
      value: "v2",
    });
    expect(rotated.id).toBe(created.id);
    expect(rotated.latestVersion).toBe(2);
    expect(rotated.status).toBe("active");
  });
});

describe("secretService.upsertSecretByName (routing-only)", () => {
  // Mock-driven test for the conflict-on-deleted branch. The real getByName
  // filters out status='deleted' rows at the SQL layer, so the deleted branch
  // is reachable in production only via stale rows from partial cleanup. We
  // assert the routing here so the defensive branch is covered.
  it("throws conflict when getByName surfaces a row in deleted status", async () => {
    const companyId = randomUUID();
    const deletedRow = {
      id: randomUUID(),
      companyId,
      name: "oauth:test:xyz:access",
      status: "deleted",
    };

    const selectChain = {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      then: (resolve: (rows: unknown[]) => unknown) => resolve([deletedRow]),
    };
    const fakeDb = {
      select: vi.fn().mockReturnValue(selectChain),
    } as unknown as ReturnType<typeof createDb>;

    const svc = secretService(fakeDb);
    await expect(
      svc.upsertSecretByName(companyId, {
        name: "oauth:test:xyz:access",
        value: "v1",
      }),
    ).rejects.toThrow(/previously deleted/i);
  });
});
