import { TableClient, type TableEntity, type TableEntityResult } from "@azure/data-tables";
import type {
  TestDefinition,
  TestDefinitionItem,
  TestDefinitionRevision,
  TestDefinitionSuite,
  TestExecution,
  TestRun,
  TestRunItem,
  TestRunSuite,
} from "@manual-test-manager/domain";
import type {
  RepositorySet,
  TestDefinitionItemRepository,
  TestDefinitionRepository,
  TestDefinitionRevisionRepository,
  TestDefinitionSuiteRepository,
  TestExecutionRepository,
  TestRunItemRepository,
  TestRunRepository,
  TestRunSuiteRepository,
  Versioned,
} from "./index.js";
import { ETagConflictError } from "./index.js";

type Stored<T> = T & { partitionKey: string; rowKey: string };

function entity<T>(value: T, partitionKey: string, rowKey: string): Stored<T> {
  return { ...value, partitionKey, rowKey };
}

function fromEntity<T>(result: TableEntityResult<Stored<T>>): Versioned<T> {
  const value = Object.fromEntries(
    Object.entries(result).filter(([key]) => !["partitionKey", "rowKey", "etag", "timestamp"].includes(key)),
  ) as T;
  return { value, etag: result.etag ?? "" };
}

function normalizeRun(result: Versioned<TestRun>): Versioned<TestRun> {
  return { etag: result.etag, value: { ...result.value, sourceType: result.value.sourceType || "azureRepos" } };
}

function itemEntity(item: TestRunItem): Stored<Omit<TestRunItem, "hierarchy"> & { hierarchy: string }> {
  const { hierarchy, ...rest } = item;
  return entity({ ...rest, hierarchy: JSON.stringify(hierarchy) }, item.runId, item.id);
}

function itemFromEntity(
  result: TableEntityResult<Stored<Omit<TestRunItem, "hierarchy"> & { hierarchy: string }>>,
): Versioned<TestRunItem> {
  const parsed = fromEntity(result);
  return {
    etag: parsed.etag,
    value: {
      ...parsed.value,
      hierarchy: JSON.parse(parsed.value.hierarchy) as string[],
    },
  };
}

class RunTable implements TestRunRepository {
  constructor(private readonly table: TableClient) {}
  async create(run: TestRun) {
    await this.table.createEntity(entity(run, run.repositoryId || run.definitionId || "app-managed", run.id));
    return this.get(run.id) as Promise<Versioned<TestRun>>;
  }
  async get(runId: string) {
    const result = await this.table
      .listEntities<Stored<TestRun>>({
        queryOptions: { filter: `RowKey eq '${runId.replaceAll("'", "''")}'` },
      })
      .next();
    return result.done ? undefined : normalizeRun(fromEntity(result.value));
  }
  async update(run: TestRun) {
    await this.table.upsertEntity(entity(run, run.repositoryId || run.definitionId || "app-managed", run.id), "Merge");
    return this.get(run.id) as Promise<Versioned<TestRun>>;
  }
}

class SuiteTable implements TestRunSuiteRepository {
  constructor(private readonly table: TableClient) {}
  async create(suite: TestRunSuite) {
    await this.table.createEntity(entity(suite, suite.runId, suite.suiteId));
    const all = await this.listByRun(suite.runId);
    return all.find((entry) => entry.value.suiteId === suite.suiteId) as Versioned<TestRunSuite>;
  }
  async listByRun(runId: string) {
    const output: Array<Versioned<TestRunSuite>> = [];
    for await (const item of this.table.listEntities<Stored<TestRunSuite>>({
      queryOptions: {
        filter: `PartitionKey eq '${runId.replaceAll("'", "''")}'`,
      },
    }))
      output.push(fromEntity(item));
    return output;
  }
}

class ItemTable implements TestRunItemRepository {
  constructor(private readonly table: TableClient) {}
  async create(item: TestRunItem) {
    await this.table.createEntity(itemEntity(item));
    return this.get(item.runId, item.id) as Promise<Versioned<TestRunItem>>;
  }
  async get(runId: string, itemId: string) {
    try {
      return itemFromEntity(
        await this.table.getEntity<Stored<Omit<TestRunItem, "hierarchy"> & { hierarchy: string }>>(runId, itemId),
      );
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }
  async listByRun(runId: string) {
    const output: Array<Versioned<TestRunItem>> = [];
    for await (const item of this.table.listEntities<Stored<Omit<TestRunItem, "hierarchy"> & { hierarchy: string }>>({
      queryOptions: {
        filter: `PartitionKey eq '${runId.replaceAll("'", "''")}'`,
      },
    }))
      output.push(itemFromEntity(item));
    return output;
  }
  async update(item: TestRunItem, expectedEtag: string) {
    try {
      await this.table.updateEntity(
        { ...itemEntity(item), etag: expectedEtag } as TableEntity<
          Stored<Omit<TestRunItem, "hierarchy"> & { hierarchy: string }>
        >,
        "Replace",
      );
      return this.get(item.runId, item.id) as Promise<Versioned<TestRunItem>>;
    } catch (error) {
      if (isPrecondition(error)) throw new ETagConflictError();
      throw error;
    }
  }
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 404;
}
function isPrecondition(error: unknown): boolean {
  return typeof error === "object" && error !== null && "statusCode" in error && error.statusCode === 412;
}

class ExecutionTable implements TestExecutionRepository {
  constructor(private readonly table: TableClient) {}
  async create(execution: TestExecution) {
    await this.table.createEntity(entity(execution, execution.runId, `${execution.itemId}_${execution.id}`));
    return { value: execution, etag: "" };
  }
  async listByItem(runId: string, itemId: string) {
    const output: Array<Versioned<TestExecution>> = [];
    for await (const item of this.table.listEntities<Stored<TestExecution>>({
      queryOptions: {
        filter: `PartitionKey eq '${runId.replaceAll("'", "''")}'`,
      },
    }))
      if (item.itemId === itemId) output.push(fromEntity(item));
    return output;
  }
}

class DefinitionTable implements TestDefinitionRepository {
  constructor(private readonly table: TableClient) {}
  async create(definition: TestDefinition) {
    await this.table.createEntity(entity(definition, definition.projectId, definition.id));
    return this.get(definition.projectId, definition.id) as Promise<Versioned<TestDefinition>>;
  }
  async get(projectId: string, definitionId: string) {
    try {
      return fromEntity(await this.table.getEntity<Stored<TestDefinition>>(projectId, definitionId));
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }
  async list(projectId: string) {
    const output: Array<Versioned<TestDefinition>> = [];
    for await (const item of this.table.listEntities<Stored<TestDefinition>>({
      queryOptions: { filter: `PartitionKey eq '${projectId.replaceAll("'", "''")}'` },
    }))
      if (!item.archived) output.push(fromEntity(item));
    return output;
  }
  async update(definition: TestDefinition, expectedEtag: string) {
    try {
      await this.table.updateEntity(
        { ...entity(definition, definition.projectId, definition.id), etag: expectedEtag } as TableEntity<
          Stored<TestDefinition>
        >,
        "Replace",
      );
      return this.get(definition.projectId, definition.id) as Promise<Versioned<TestDefinition>>;
    } catch (error) {
      if (isPrecondition(error)) throw new ETagConflictError();
      throw error;
    }
  }
  async delete(projectId: string, definitionId: string) {
    const current = await this.get(projectId, definitionId);
    if (!current) return;
    await this.update({ ...current.value, archived: true }, current.etag);
  }
}

class RevisionTable implements TestDefinitionRevisionRepository {
  constructor(private readonly table: TableClient) {}
  async create(revision: TestDefinitionRevision) {
    const stored = {
      ...revision,
      importedFrom: revision.importedFrom ? JSON.stringify(revision.importedFrom) : undefined,
    };
    await this.table.createEntity(entity(stored, revision.definitionId, revision.id));
    return this.get(revision.definitionId, revision.id) as Promise<Versioned<TestDefinitionRevision>>;
  }
  async get(definitionId: string, revisionId: string) {
    try {
      const result = fromEntity(
        await this.table.getEntity<Stored<Omit<TestDefinitionRevision, "importedFrom"> & { importedFrom?: string }>>(
          definitionId,
          revisionId,
        ),
      );
      return {
        etag: result.etag,
        value: {
          ...result.value,
          importedFrom: result.value.importedFrom ? JSON.parse(result.value.importedFrom) : undefined,
        },
      };
    } catch (error) {
      if (isNotFound(error)) return undefined;
      throw error;
    }
  }
  async listByDefinition(definitionId: string) {
    const output: Array<Versioned<TestDefinitionRevision>> = [];
    for await (const item of this.table.listEntities<
      Stored<Omit<TestDefinitionRevision, "importedFrom"> & { importedFrom?: string }>
    >({
      queryOptions: { filter: `PartitionKey eq '${definitionId.replaceAll("'", "''")}'` },
    })) {
      const parsed = fromEntity(item);
      output.push({
        etag: parsed.etag,
        value: {
          ...parsed.value,
          importedFrom: parsed.value.importedFrom ? JSON.parse(parsed.value.importedFrom) : undefined,
        },
      });
    }
    return output;
  }
}

class DefinitionSuiteTable implements TestDefinitionSuiteRepository {
  constructor(private readonly table: TableClient) {}
  async create(suite: TestDefinitionSuite) {
    await this.table.createEntity(entity(suite, suite.revisionId, suite.id));
    const values = await this.listByRevision(suite.revisionId);
    return values.find((entry) => entry.value.id === suite.id) as Versioned<TestDefinitionSuite>;
  }
  async listByRevision(revisionId: string) {
    const output: Array<Versioned<TestDefinitionSuite>> = [];
    for await (const item of this.table.listEntities<Stored<TestDefinitionSuite>>({
      queryOptions: { filter: `PartitionKey eq '${revisionId.replaceAll("'", "''")}'` },
    }))
      output.push(fromEntity(item));
    return output.sort((a, b) => a.value.order - b.value.order);
  }
}

class DefinitionItemTable implements TestDefinitionItemRepository {
  constructor(private readonly table: TableClient) {}
  async create(item: TestDefinitionItem) {
    await this.table.createEntity(
      entity({ ...item, hierarchy: JSON.stringify(item.hierarchy) }, item.revisionId, item.id),
    );
    const values = await this.listByRevision(item.revisionId);
    return values.find((entry) => entry.value.id === item.id) as Versioned<TestDefinitionItem>;
  }
  async listByRevision(revisionId: string) {
    const output: Array<Versioned<TestDefinitionItem>> = [];
    for await (const item of this.table.listEntities<
      Stored<Omit<TestDefinitionItem, "hierarchy"> & { hierarchy: string }>
    >({
      queryOptions: { filter: `PartitionKey eq '${revisionId.replaceAll("'", "''")}'` },
    })) {
      const parsed = fromEntity(item);
      output.push({
        etag: parsed.etag,
        value: { ...parsed.value, hierarchy: JSON.parse(parsed.value.hierarchy) as string[] },
      });
    }
    return output.sort((a, b) => a.value.order - b.value.order);
  }
}

export async function createAzureTableRepositories(
  connectionString: string,
  tableNames = {
    runs: "TestRuns",
    suites: "TestRunSuites",
    items: "TestRunItems",
    executions: "TestExecutions",
    definitions: "TestDefinitions",
    definitionRevisions: "TestDefinitionRevisions",
    definitionSuites: "TestDefinitionSuites",
    definitionItems: "TestDefinitionItems",
  },
): Promise<RepositorySet> {
  const clients = Object.fromEntries(
    Object.entries(tableNames).map(([key, name]) => [key, TableClient.fromConnectionString(connectionString, name)]),
  ) as Record<keyof typeof tableNames, TableClient>;
  await Promise.all(
    Object.values(clients).map((client) =>
      client.createTable().catch((error: unknown) => {
        if (!(error instanceof Error && error.message.includes("TableAlreadyExists"))) throw error;
      }),
    ),
  );
  return {
    runs: new RunTable(clients.runs),
    suites: new SuiteTable(clients.suites),
    items: new ItemTable(clients.items),
    executions: new ExecutionTable(clients.executions),
    definitions: new DefinitionTable(clients.definitions),
    definitionRevisions: new RevisionTable(clients.definitionRevisions),
    definitionSuites: new DefinitionSuiteTable(clients.definitionSuites),
    definitionItems: new DefinitionItemTable(clients.definitionItems),
  };
}
