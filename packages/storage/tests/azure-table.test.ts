import { beforeEach, describe, expect, test, vi } from "vitest";

const { FakeTableClient } = vi.hoisted(() => {
  class FakeTableClient {
    private revision = 0;
    private readonly values = new Map<string, Record<string, unknown>>();
    static fromConnectionString(_connectionString: string, tableName: string) {
      return new FakeTableClient(tableName);
    }
    constructor(private readonly tableName: string) {}
    async createTable() {}
    async createEntity(value: Record<string, unknown>) {
      const key = `${value.partitionKey}/${value.rowKey}`;
      if (this.values.has(key)) throw { statusCode: 409 };
      const etag = `etag-${++this.revision}`;
      this.values.set(key, { ...value, etag });
      return { etag };
    }
    async updateEntity(value: Record<string, unknown>, mode: string, options?: { etag?: string }) {
      const key = `${value.partitionKey}/${value.rowKey}`;
      const current = this.values.get(key);
      if (!current) throw { statusCode: 404 };
      if (options?.etag !== current.etag) throw { statusCode: 412 };
      const etag = `etag-${++this.revision}`;
      this.values.set(key, { ...(mode === "Merge" ? current : {}), ...value, etag });
      return { etag };
    }
    async upsertEntity(value: Record<string, unknown>) {
      this.values.set(`${value.partitionKey}/${value.rowKey}`, { ...value, etag: `etag-${this.tableName}` });
    }
    async getEntity<T>(partitionKey: string, rowKey: string): Promise<T> {
      const value = this.values.get(`${partitionKey}/${rowKey}`);
      if (!value) throw { statusCode: 404 };
      return structuredClone(value) as T;
    }
    async *listEntities<T>() {
      for (const value of this.values.values()) yield value as T;
    }
  }
  return { FakeTableClient };
});

vi.mock("@azure/data-tables", () => ({ TableClient: FakeTableClient }));

const { createAzureTableRepositories } = await import("../dist/index.js");

describe("Azure Table repositories", () => {
  beforeEach(() => vi.clearAllMocks());

  test("stores and lists summaries by project", async () => {
    const repositories = await createAzureTableRepositories("UseDevelopmentStorage=true");
    await repositories.summaries.upsert({
      runId: "run-1",
      projectId: "project-1",
      sourceType: "github",
      state: "inProgress",
      startedBy: "alice",
      startedAt: "2026-01-01T00:00:00.000Z",
      totalCount: 2,
      pendingCount: 2,
      passedCount: 0,
      failedCount: 0,
      blockedCount: 0,
      skippedCount: 0,
    });

    await expect(repositories.summaries.list("project-1")).resolves.toMatchObject({
      items: [{ value: { runId: "run-1", projectId: "project-1", sourceType: "github" } }],
    });
  });

  test("rejects stale item updates and rollback, and preserves the successful writer", async () => {
    const repositories = await createAzureTableRepositories("UseDevelopmentStorage=true");
    const initial = await repositories.items.create({
      runId: "run",
      id: "item",
      suiteId: "suite",
      hierarchy: ["Chapter"],
      text: "Test",
      status: "pending",
    });
    const alice = await repositories.items.update({ ...initial.value, status: "passed" }, initial.etag);
    const bob = await repositories.items.update({ ...alice.value, status: "failed", lastComment: "bob" }, alice.etag);
    await expect(repositories.items.update(initial.value, alice.etag)).rejects.toMatchObject({
      name: "ETagConflictError",
    });
    await expect(repositories.items.update(initial.value, initial.etag)).rejects.toMatchObject({
      name: "ETagConflictError",
    });
    await expect(repositories.items.update(initial.value, "*")).rejects.toMatchObject({ name: "ETagConflictError" });
    expect(await repositories.items.get("run", "item")).toEqual(bob);
  });

  test("replaces run rows to remove completion fields and rejects stale transitions", async () => {
    const repositories = await createAzureTableRepositories("UseDevelopmentStorage=true");
    const completed = await repositories.runs.create({
      id: "run",
      repositoryId: "repo",
      state: "completed",
      result: "passed",
      startedBy: "alice",
      startedAt: "2026-01-01T00:00:00Z",
      completedBy: "bob",
      completedAt: "2026-01-02T00:00:00Z",
    });
    const { result: _result, completedBy: _by, completedAt: _at, ...base } = completed.value;
    const reopened = await repositories.runs.update({ ...base, state: "inProgress" }, completed.etag);
    expect((await repositories.runs.get("run"))?.value).toEqual(reopened.value);
    await expect(repositories.runs.update(completed.value, completed.etag)).rejects.toMatchObject({
      name: "ETagConflictError",
    });
  });

  test("conditionally replaces definitions and round-trips the durable history outbox", async () => {
    const repositories = await createAzureTableRepositories("UseDevelopmentStorage=true");
    const definition = await repositories.definitions.create({
      id: "definition",
      projectId: "project",
      name: "Release",
      currentRevisionId: "revision",
      createdBy: "alice",
      updatedBy: "alice",
      createdAt: "now",
      updatedAt: "now",
    });
    await repositories.definitions.update({ ...definition.value, name: "New" }, definition.etag);
    await expect(repositories.definitions.update(definition.value, definition.etag)).rejects.toMatchObject({
      name: "ETagConflictError",
    });
    const execution = {
      id: "execution",
      runId: "run",
      itemId: "item",
      status: "passed" as const,
      executedBy: "alice",
      executedAt: "now",
    };
    const item = await repositories.items.create({
      id: "item",
      runId: "run",
      suiteId: "suite",
      hierarchy: [],
      text: "test",
      status: "passed",
      pendingExecution: execution,
    });
    expect(item.value.pendingExecution).toEqual(execution);
    await repositories.executions.create(execution);
    await repositories.executions.create(execution);
    expect(await repositories.executions.listByItem("run", "item")).toHaveLength(1);
  });
});
