import { randomUUID } from "node:crypto";
import type { TestExecution, TestRunItem } from "@manual-test-manager/domain";
import { ETagConflictError, type Versioned } from "@manual-test-manager/storage";
import type { ExecutionInput } from "../service.js";
import type { ServiceContext } from "./context.js";
import { ServiceError } from "./errors.js";
import { requireRun, syncSummary } from "./test-runs.js";

export async function listExecutions(context: ServiceContext, runId: string, itemId: string) {
  await requireRun(context.repositories, runId);
  const executions = await context.repositories.executions.listByItem(runId, itemId);
  return executions.sort((a, b) => a.value.executedAt.localeCompare(b.value.executedAt));
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
  if (["failed", "blocked"].includes(input.status) && !input.comment?.trim())
    throw new ServiceError(400, "comment is required for failed or blocked execution");
  if (input.status === "skipped" && !input.comment?.trim())
    throw new ServiceError(400, "a reason is required for skipped execution");
  const current = await context.repositories.items.get(runId, input.itemId);
  if (!current) throw new ServiceError(404, "test item not found");
  if (current.value.inScope === false) throw new ServiceError(409, "test item is outside the selected run scope");
  const executedAt = context.now();
  let item: Versioned<TestRunItem>;
  try {
    const updatedItem = {
      ...current.value,
      status: input.status,
      lastExecutedBy: input.executedBy,
      lastExecutedAt: executedAt,
    };
    delete updatedItem.lastComment;
    delete updatedItem.lastEvidenceUrl;
    delete updatedItem.lastIssueTicketUrl;
    if (input.comment) updatedItem.lastComment = input.comment;
    if (input.evidenceUrl) updatedItem.lastEvidenceUrl = input.evidenceUrl;
    if (input.issueTicketUrl) updatedItem.lastIssueTicketUrl = input.issueTicketUrl;
    item = await context.repositories.items.update(updatedItem, input.expectedEtag);
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
    ...(input.evidenceUrl ? { evidenceUrl: input.evidenceUrl } : {}),
    ...(input.issueTicketUrl ? { issueTicketUrl: input.issueTicketUrl } : {}),
  };
  let savedExecution: Versioned<TestExecution>;
  try {
    savedExecution = await context.repositories.executions.create(execution);
  } catch (error) {
    try {
      await context.repositories.items.update(current.value, item.etag);
    } catch (rollbackError) {
      throw new AggregateError(
        [error, rollbackError],
        "execution save failed and the item result could not be restored",
      );
    }
    throw error;
  }
  const result = { item, execution: savedExecution };
  await syncSummary(context, runId);
  return result;
}
