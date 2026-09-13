import { randomUUID } from "node:crypto";
import type { TestExecution, TestRunItem } from "@manual-test-manager/domain";
import { ETagConflictError, type Versioned } from "@manual-test-manager/storage";
import type { ExecutionInput } from "../service.js";
import type { ServiceContext } from "./context.js";
import { ServiceError } from "./errors.js";
import { requireRun } from "./test-runs.js";

export async function listExecutions(context: ServiceContext, runId: string, itemId: string) {
  await requireRun(context.repositories, runId);
  return context.repositories.executions.listByItem(runId, itemId);
}

export async function execute(
  context: ServiceContext,
  runId: string,
  input: ExecutionInput,
): Promise<{
  item: Versioned<TestRunItem>;
  execution: Versioned<TestExecution>;
}> {
  const run = await requireRun(context.repositories, runId);
  if (run.value.state !== "inProgress") throw new ServiceError(409, "completed or cancelled runs are read-only");
  const current = await context.repositories.items.get(runId, input.itemId);
  if (!current) throw new ServiceError(404, "test item not found");
  const executedAt = context.now();
  let item: Versioned<TestRunItem>;
  try {
    item = await context.repositories.items.update(
      {
        ...current.value,
        status: input.status,
        lastExecutedBy: input.executedBy,
        lastExecutedAt: executedAt,
      },
      input.expectedEtag,
    );
  } catch (error) {
    if (error instanceof ETagConflictError) throw new ServiceError(409, error.message);
    throw error;
  }
  const execution: TestExecution = {
    id: randomUUID(),
    runId,
    itemId: input.itemId,
    status: input.status,
    executedBy: input.executedBy,
    executedAt,
    ...(input.comment ? { comment: input.comment } : {}),
  };
  return {
    item,
    execution: await context.repositories.executions.create(execution),
  };
}
