import { beforeEach, describe, expect, test, vi } from "vitest";

const { FakeTableClient } = vi.hoisted(() => {
  class FakeTableClient {
    private readonly values = new Map<string, Record<string, unknown>>();
    static fromConnectionString(_connectionString: string, tableName: string) {
      return new FakeTableClient(tableName);
    }
    constructor(private readonly tableName: string) {}
    async createTable() {}
    async upsertEntity(value: Record<string, unknown>) {
      this.values.set(`${value.partitionKey}/${value.rowKey}`, { ...value, etag: `etag-${this.tableName}` });
    }
    async getEntity<T>(partitionKey: string, rowKey: string): Promise<T> {
      const value = this.values.get(`${partitionKey}/${rowKey}`);
      if (!value) throw { statusCode: 404 };
      return value as T;
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
});
