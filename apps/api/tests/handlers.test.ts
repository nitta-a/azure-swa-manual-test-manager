import type { HttpRequest, InvocationContext } from "@azure/functions";
import { expect, test, vi } from "vitest";
import { getTestExecutions } from "../src/handlers/executions.js";
import { getPullRequest, getTestDefinition, listPullRequests } from "../src/handlers/pull-requests.js";
import {
  cancelTestRun,
  completeTestRun,
  getTestRun,
  getTestRunItems,
  reopenTestRun,
} from "../src/handlers/test-runs.js";
import type { TestRunService } from "../src/service.js";

function request(params: Record<string, string> = {}, headers: Record<string, string> = {}): HttpRequest {
  return {
    headers: new Headers(headers),
    params,
  } as unknown as HttpRequest;
}

const context = {} as InvocationContext;

test("delegates every read and lifecycle route to the service", async () => {
  const service = {
    listPullRequests: vi.fn(async () => ["pull-request"]),
    getPullRequest: vi.fn(async (id: number) => ({ id })),
    getTestDefinition: vi.fn(async (id: number) => ({ id })),
    get: vi.fn(async (id: string) => ({ id })),
    listItems: vi.fn(async (id: string) => ({ id })),
    listExecutions: vi.fn(async (runId: string, itemId: string) => ({
      runId,
      itemId,
    })),
    complete: vi.fn(async (runId: string, userId: string) => ({
      runId,
      userId,
    })),
    reopen: vi.fn(async (runId: string) => ({ runId })),
    cancel: vi.fn(async (runId: string) => ({ runId })),
  } as unknown as TestRunService;

  await listPullRequests(request(), context, service);
  await getPullRequest(request({ pullRequestId: "42" }), context, service);
  await getTestDefinition(request({ pullRequestId: "42" }), context, service);
  await getTestRun(request({ runId: "run-1" }), context, service);
  await getTestRunItems(request({ runId: "run-1" }), context, service);
  await getTestExecutions(request({ runId: "run-1", itemId: "item-1" }), context, service);
  await completeTestRun(request({ runId: "run-1" }, { "x-user-id": "alice" }), context, service);
  await reopenTestRun(request({ runId: "run-1" }), context, service);
  await cancelTestRun(request({ runId: "run-1" }), context, service);

  expect(service.listPullRequests).toHaveBeenCalledOnce();
  expect(service.getPullRequest).toHaveBeenCalledWith(42);
  expect(service.getTestDefinition).toHaveBeenCalledWith(42);
  expect(service.get).toHaveBeenCalledWith("run-1");
  expect(service.listItems).toHaveBeenCalledWith("run-1");
  expect(service.listExecutions).toHaveBeenCalledWith("run-1", "item-1");
  expect(service.complete).toHaveBeenCalledWith("run-1", "alice");
  expect(service.reopen).toHaveBeenCalledWith("run-1");
  expect(service.cancel).toHaveBeenCalledWith("run-1");
});
