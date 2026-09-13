import type {
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
  get(
    runId: string,
    itemId: string,
  ): Promise<Versioned<TestRunItem> | undefined>;
  listByRun(runId: string): Promise<Array<Versioned<TestRunItem>>>;
  update(
    item: TestRunItem,
    expectedEtag: string,
  ): Promise<Versioned<TestRunItem>>;
}
export interface TestExecutionRepository {
  create(execution: TestExecution): Promise<Versioned<TestExecution>>;
  listByItem(
    runId: string,
    itemId: string,
  ): Promise<Array<Versioned<TestExecution>>>;
}
export interface RepositorySet {
  runs: TestRunRepository;
  suites: TestRunSuiteRepository;
  items: TestRunItemRepository;
  executions: TestExecutionRepository;
}

const copy = <T>(value: T): T => structuredClone(value);

export class InMemoryRepositories implements RepositorySet {
  readonly runs = new InMemoryRuns();
  readonly suites = new InMemorySuites();
  readonly items = new InMemoryItems();
  readonly executions = new InMemoryExecutions();
}

class InMemoryRuns implements TestRunRepository {
  private readonly values = new Map<string, Versioned<TestRun>>();
  async create(run: TestRun) {
    return this.save(run);
  }
  async get(id: string) {
    const result = this.values.get(id);
    return result
      ? { value: copy(result.value), etag: result.etag }
      : undefined;
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
    return result
      ? { value: copy(result.value), etag: result.etag }
      : undefined;
  }
  async listByRun(runId: string) {
    return [...this.values.values()]
      .filter((entry) => entry.value.runId === runId)
      .map((entry) => ({ value: copy(entry.value), etag: entry.etag }));
  }
  async update(item: TestRunItem, expectedEtag: string) {
    const key = `${item.runId}/${item.id}`;
    const current = this.values.get(key);
    if (!current || current.etag !== expectedEtag)
      throw new ETagConflictError();
    const result = { value: copy(item), etag: crypto.randomUUID() };
    this.values.set(key, result);
    return { value: copy(result.value), etag: result.etag };
  }
}

class InMemoryExecutions implements TestExecutionRepository {
  private readonly values = new Map<string, Versioned<TestExecution>>();
  async create(execution: TestExecution) {
    const result = { value: copy(execution), etag: crypto.randomUUID() };
    this.values.set(
      `${execution.runId}/${execution.itemId}/${execution.id}`,
      result,
    );
    return { value: copy(result.value), etag: result.etag };
  }
  async listByItem(runId: string, itemId: string) {
    return [...this.values.values()]
      .filter(
        (entry) => entry.value.runId === runId && entry.value.itemId === itemId,
      )
      .map((entry) => ({ value: copy(entry.value), etag: entry.etag }));
  }
}

export * from "./azure-table.js";
