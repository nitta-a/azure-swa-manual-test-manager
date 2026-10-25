import { randomUUID } from "node:crypto";
import type { TestExecution, TestRunItem } from "@manual-test-manager/domain";
import { ETagConflictError, type Versioned } from "@manual-test-manager/storage";
import type { ExecutionInput } from "../service.js";
import type { ServiceContext } from "./context.js";
import { ServiceError } from "./errors.js";
import { recoverItems } from "./recovery.js";
import { requireRun, syncSummary } from "./test-runs.js";

export async function listExecutions(context: ServiceContext, runId: string, itemId: string) {
  await requireRun(context.repositories, runId);
  await recoverItems(context, runId);
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
  await recoverItems(context, runId);
  const current = await context.repositories.items.get(runId, input.itemId);
  if (!current) throw new ServiceError(404, "test item not found");
  if (current.value.inScope === false) throw new ServiceError(409, "test item is outside the selected run scope");
  const executedAt = context.now();
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
  try {
    const updatedItem = {
      ...current.value,
      status: input.status,
      lastExecutedBy: input.executedBy,
      lastExecutedAt: executedAt,
      pendingExecution: execution,
    };
    delete updatedItem.lastComment;
    delete updatedItem.lastEvidenceUrl;
    delete updatedItem.lastIssueTicketUrl;
    if (input.comment) updatedItem.lastComment = input.comment;
    if (input.evidenceUrl) updatedItem.lastEvidenceUrl = input.evidenceUrl;
    if (input.issueTicketUrl) updatedItem.lastIssueTicketUrl = input.issueTicketUrl;
    await context.repositories.items.update(updatedItem, input.expectedEtag);
  } catch (error) {
    if (error instanceof ETagConflictError) throw new ServiceError(409, error.message);
    throw error;
  }
  // The item carries a durable outbox. A lost response must not roll back a
  // result whose history may already have been committed.
  const savedExecution = await context.repositories.executions.create(execution);
  const recovered = await recoverItems(context, runId);
  const recoveredItem = recovered.find((entry) => entry.value.id === input.itemId);
  if (!recoveredItem) throw new Error("test item disappeared while saving execution");
  const result = {
    item: recoveredItem,
    execution: savedExecution,
  };
  await syncSummary(context, runId);
  return result;
}
