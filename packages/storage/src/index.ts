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

export interface Versioned<T> {
  value: T;
  etag: string;
}

export class ETagConflictError extends Error {
  constructor(message = "the item was changed by another user") {
    super(message);
    this.name = "ETagConflictError";
  }
}

export interface TestRunRepository {
  create(run: TestRun): Promise<Versioned<TestRun>>;
  get(runId: string): Promise<Versioned<TestRun> | undefined>;
  update(run: TestRun): Promise<Versioned<TestRun>>;
}
export interface TestRunSuiteRepository {
  create(suite: TestRunSuite): Promise<Versioned<TestRunSuite>>;
  listByRun(runId: string): Promise<Array<Versioned<TestRunSuite>>>;
}
export interface TestRunItemRepository {
  create(item: TestRunItem): Promise<Versioned<TestRunItem>>;
  get(runId: string, itemId: string): Promise<Versioned<TestRunItem> | undefined>;
  listByRun(runId: string): Promise<Array<Versioned<TestRunItem>>>;
  update(item: TestRunItem, expectedEtag: string): Promise<Versioned<TestRunItem>>;
}
export interface TestExecutionRepository {
  create(execution: TestExecution): Promise<Versioned<TestExecution>>;
  listByItem(runId: string, itemId: string): Promise<Array<Versioned<TestExecution>>>;
}
export interface TestDefinitionRepository {
  create(definition: TestDefinition): Promise<Versioned<TestDefinition>>;
  get(projectId: string, definitionId: string): Promise<Versioned<TestDefinition> | undefined>;
  list(projectId: string): Promise<Array<Versioned<TestDefinition>>>;
  update(definition: TestDefinition, expectedEtag: string): Promise<Versioned<TestDefinition>>;
  delete(projectId: string, definitionId: string): Promise<void>;
}
export interface TestDefinitionRevisionRepository {
  create(revision: TestDefinitionRevision): Promise<Versioned<TestDefinitionRevision>>;
  get(definitionId: string, revisionId: string): Promise<Versioned<TestDefinitionRevision> | undefined>;
  listByDefinition(definitionId: string): Promise<Array<Versioned<TestDefinitionRevision>>>;
}
export interface TestDefinitionSuiteRepository {
  create(suite: TestDefinitionSuite): Promise<Versioned<TestDefinitionSuite>>;
  listByRevision(revisionId: string): Promise<Array<Versioned<TestDefinitionSuite>>>;
}
export interface TestDefinitionItemRepository {
  create(item: TestDefinitionItem): Promise<Versioned<TestDefinitionItem>>;
  listByRevision(revisionId: string): Promise<Array<Versioned<TestDefinitionItem>>>;
}
export interface RepositorySet {
  runs: TestRunRepository;
  suites: TestRunSuiteRepository;
  items: TestRunItemRepository;
  executions: TestExecutionRepository;
  definitions: TestDefinitionRepository;
  definitionRevisions: TestDefinitionRevisionRepository;
  definitionSuites: TestDefinitionSuiteRepository;
  definitionItems: TestDefinitionItemRepository;
}

const copy = <T>(value: T): T => structuredClone(value);

function normalizeRun(value: Versioned<TestRun>): Versioned<TestRun> {
  return { etag: value.etag, value: { ...copy(value.value), sourceType: value.value.sourceType || "azureRepos" } };
}

export class InMemoryRepositories implements RepositorySet {
  readonly runs = new InMemoryRuns();
  readonly suites = new InMemorySuites();
  readonly items = new InMemoryItems();
  readonly executions = new InMemoryExecutions();
  readonly definitions = new InMemoryDefinitions();
  readonly definitionRevisions = new InMemoryDefinitionRevisions();
  readonly definitionSuites = new InMemoryDefinitionSuites();
  readonly definitionItems = new InMemoryDefinitionItems();
}

class InMemoryDefinitions implements TestDefinitionRepository {
  private readonly values = new Map<string, Versioned<TestDefinition>>();
  async create(definition: TestDefinition) {
    const key = `${definition.projectId}/${definition.id}`;
    if (this.values.has(key)) throw new Error("definition already exists");
    return this.save(key, definition);
  }
  async get(projectId: string, definitionId: string) {
    const value = this.values.get(`${projectId}/${definitionId}`);
    return value ? { value: copy(value.value), etag: value.etag } : undefined;
  }
  async list(projectId: string) {
    return [...this.values.entries()]
      .filter(([key, value]) => key.startsWith(`${projectId}/`) && !value.value.archived)
      .map(([, value]) => ({ value: copy(value.value), etag: value.etag }));
  }
  async update(definition: TestDefinition, expectedEtag: string) {
    const key = `${definition.projectId}/${definition.id}`;
    const current = this.values.get(key);
    if (!current || current.etag !== expectedEtag) throw new ETagConflictError();
    return this.save(key, definition);
  }
  async delete(projectId: string, definitionId: string) {
    const current = this.values.get(`${projectId}/${definitionId}`);
    if (current)
      this.values.set(`${projectId}/${definitionId}`, {
        value: { ...current.value, archived: true, updatedAt: new Date().toISOString() },
        etag: crypto.randomUUID(),
      });
  }
  private save(key: string, value: TestDefinition) {
    const result = { value: copy(value), etag: crypto.randomUUID() };
    this.values.set(key, result);
    return Promise.resolve({ value: copy(result.value), etag: result.etag });
  }
}

class InMemoryDefinitionRevisions implements TestDefinitionRevisionRepository {
  private readonly values = new Map<string, Versioned<TestDefinitionRevision>>();
  async create(revision: TestDefinitionRevision) {
    const result = { value: copy(revision), etag: crypto.randomUUID() };
    this.values.set(`${revision.definitionId}/${revision.id}`, result);
    return { value: copy(result.value), etag: result.etag };
  }
  async get(definitionId: string, revisionId: string) {
    const value = this.values.get(`${definitionId}/${revisionId}`);
    return value ? { value: copy(value.value), etag: value.etag } : undefined;
  }
  async listByDefinition(definitionId: string) {
    return [...this.values.values()]
      .filter(({ value }) => value.definitionId === definitionId)
      .map((value) => ({ value: copy(value.value), etag: value.etag }));
  }
}

class InMemoryDefinitionSuites implements TestDefinitionSuiteRepository {
  private readonly values = new Map<string, Versioned<TestDefinitionSuite>>();
  async create(suite: TestDefinitionSuite) {
    const result = { value: copy(suite), etag: crypto.randomUUID() };
    this.values.set(`${suite.revisionId}/${suite.id}`, result);
    return { value: copy(result.value), etag: result.etag };
  }
  async listByRevision(revisionId: string) {
    return [...this.values.values()]
      .filter(({ value }) => value.revisionId === revisionId)
      .sort((a, b) => a.value.order - b.value.order)
      .map((value) => ({ value: copy(value.value), etag: value.etag }));
  }
}

class InMemoryDefinitionItems implements TestDefinitionItemRepository {
  private readonly values = new Map<string, Versioned<TestDefinitionItem>>();
  async create(item: TestDefinitionItem) {
    const result = { value: copy(item), etag: crypto.randomUUID() };
    this.values.set(`${item.revisionId}/${item.id}`, result);
    return { value: copy(result.value), etag: result.etag };
  }
  async listByRevision(revisionId: string) {
    return [...this.values.values()]
      .filter(({ value }) => value.revisionId === revisionId)
      .sort((a, b) => a.value.order - b.value.order)
      .map((value) => ({ value: copy(value.value), etag: value.etag }));
  }
}

class InMemoryRuns implements TestRunRepository {
  private readonly values = new Map<string, Versioned<TestRun>>();
  async create(run: TestRun) {
    return this.save(run);
  }
  async get(id: string) {
    const result = this.values.get(id);
    return result ? normalizeRun(result) : undefined;
  }
  async update(run: TestRun) {
    if (!this.values.has(run.id)) throw new Error("run not found");
    return this.save(run);
  }
  private save(run: TestRun) {
    const result = { value: copy(run), etag: crypto.randomUUID() };
    this.values.set(run.id, result);
    return Promise.resolve({ value: copy(result.value), etag: result.etag });
  }
}

class InMemorySuites implements TestRunSuiteRepository {
  private readonly values = new Map<string, Versioned<TestRunSuite>>();
  async create(suite: TestRunSuite) {
    const result = { value: copy(suite), etag: crypto.randomUUID() };
    this.values.set(`${suite.runId}/${suite.suiteId}`, result);
    return { value: copy(result.value), etag: result.etag };
  }
  async listByRun(runId: string) {
    return [...this.values.values()]
      .filter((entry) => entry.value.runId === runId)
      .map((entry) => ({ value: copy(entry.value), etag: entry.etag }));
  }
}

class InMemoryItems implements TestRunItemRepository {
  private readonly values = new Map<string, Versioned<TestRunItem>>();
  async create(item: TestRunItem) {
    const result = { value: copy(item), etag: crypto.randomUUID() };
    this.values.set(`${item.runId}/${item.id}`, result);
    return { value: copy(result.value), etag: result.etag };
  }
  async get(runId: string, itemId: string) {
    const result = this.values.get(`${runId}/${itemId}`);
    return result ? { value: copy(result.value), etag: result.etag } : undefined;
  }
  async listByRun(runId: string) {
    return [...this.values.values()]
      .filter((entry) => entry.value.runId === runId)
      .map((entry) => ({ value: copy(entry.value), etag: entry.etag }));
  }
  async update(item: TestRunItem, expectedEtag: string) {
    const key = `${item.runId}/${item.id}`;
    const current = this.values.get(key);
    if (!current || current.etag !== expectedEtag) throw new ETagConflictError();
    const result = { value: copy(item), etag: crypto.randomUUID() };
    this.values.set(key, result);
    return { value: copy(result.value), etag: result.etag };
  }
}

class InMemoryExecutions implements TestExecutionRepository {
  private readonly values = new Map<string, Versioned<TestExecution>>();
  async create(execution: TestExecution) {
    const result = { value: copy(execution), etag: crypto.randomUUID() };
    this.values.set(`${execution.runId}/${execution.itemId}/${execution.id}`, result);
    return { value: copy(result.value), etag: result.etag };
  }
  async listByItem(runId: string, itemId: string) {
    return [...this.values.values()]
      .filter((entry) => entry.value.runId === runId && entry.value.itemId === itemId)
      .map((entry) => ({ value: copy(entry.value), etag: entry.etag }));
  }
}

export * from "./azure-table.js";
