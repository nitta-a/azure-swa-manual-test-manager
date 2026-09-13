import { app } from "@azure/functions";
import { createTestExecution, getTestExecutions } from "./handlers/executions.js";
import { getPullRequest, getTestDefinition, listPullRequests } from "./handlers/pull-requests.js";
import {
  cancelTestRun,
  completeTestRun,
  createTestRun,
  getTestRun,
  getTestRunItems,
  reopenTestRun,
} from "./handlers/test-runs.js";
import { createHttpHandler } from "./http.js";

app.http("list-pull-requests", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "projects/{projectId}/pull-requests",
  handler: createHttpHandler(listPullRequests),
});
app.http("get-pull-request", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "projects/{projectId}/pull-requests/{pullRequestId}",
  handler: createHttpHandler(getPullRequest),
});
app.http("get-test-definition", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "projects/{projectId}/pull-requests/{pullRequestId}/test-definition",
  handler: createHttpHandler(getTestDefinition),
});
app.http("create-test-run", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "test-runs",
  handler: createHttpHandler(createTestRun),
});
app.http("get-test-run", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "test-runs/{runId}",
  handler: createHttpHandler(getTestRun),
});
app.http("get-test-run-items", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "test-runs/{runId}/items",
  handler: createHttpHandler(getTestRunItems),
});
app.http("get-test-executions", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "test-runs/{runId}/items/{itemId}/executions",
  handler: createHttpHandler(getTestExecutions),
});
app.http("create-test-execution", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "test-runs/{runId}/items/{itemId}/executions",
  handler: createHttpHandler(createTestExecution),
});
app.http("complete-test-run", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "test-runs/{runId}/complete",
  handler: createHttpHandler(completeTestRun),
});
app.http("reopen-test-run", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "test-runs/{runId}/reopen",
  handler: createHttpHandler(reopenTestRun),
});
app.http("cancel-test-run", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "test-runs/{runId}/cancel",
  handler: createHttpHandler(cancelTestRun),
});
