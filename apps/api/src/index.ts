import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from "@azure/functions";
import { z } from "zod";
import { createServiceFromEnvironment } from "./config.js";
import { ServiceError, type TestRunService } from "./service.js";

const servicePromise = createServiceFromEnvironment();
const id = z.string().trim().min(1);
const startSchema = z.object({
  repositoryId: id,
  pullRequestId: z.number().int().positive(),
  suiteIds: z.array(id).min(1),
});
const executionSchema = z.object({
  itemId: id,
  status: z.enum(["passed", "failed", "blocked", "skipped"]),
  comment: z.string().optional(),
});

type Handler = (
  request: HttpRequest,
  context: InvocationContext,
  service: TestRunService,
) => Promise<unknown>;

function principalUserId(request: HttpRequest): string {
  const header = request.headers.get("x-ms-client-principal");
  if (!header) return request.headers.get("x-user-id") || "local-user";
  try {
    const principal = JSON.parse(
      Buffer.from(header, "base64").toString("utf8"),
    ) as { userId?: string; userDetails?: string };
    return principal.userId || principal.userDetails || "authenticated-user";
  } catch {
    return "authenticated-user";
  }
}

function json(status: number, body: unknown): HttpResponseInit {
  return {
    status,
    jsonBody: body,
    headers: { "content-type": "application/json" },
  };
}

async function runHandler(
  request: HttpRequest,
  context: InvocationContext,
  handler: Handler,
): Promise<HttpResponseInit> {
  const requestId = request.headers.get("x-request-id") || crypto.randomUUID();
  try {
    return json(200, await handler(request, context, await servicePromise));
  } catch (error) {
    context.log({
      requestId,
      userId: principalUserId(request),
      runId: request.params.runId,
      repositoryId: request.params.repositoryId,
      pullRequestId: request.params.pullRequestId,
      error,
    });
    if (error instanceof ServiceError)
      return json(error.status, { error: error.message, requestId });
    if (error instanceof z.ZodError)
      return json(400, {
        error: "invalid request",
        details: error.issues,
        requestId,
      });
    return json(500, { error: "internal server error", requestId });
  }
}

const params = (request: HttpRequest, name: string): string =>
  request.params[name] || "";
const pullRequestId = (request: HttpRequest): number =>
  z.coerce.number().int().positive().parse(params(request, "pullRequestId"));

app.http("list-pull-requests", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "projects/{projectId}/pull-requests",
  handler: (request, context) =>
    runHandler(request, context, async (_request, _context, service) =>
      service.listPullRequests(),
    ),
});
app.http("get-pull-request", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "projects/{projectId}/pull-requests/{pullRequestId}",
  handler: (request, context) =>
    runHandler(request, context, async (_request, _context, service) =>
      service.getPullRequest(pullRequestId(request)),
    ),
});
app.http("get-test-definition", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "projects/{projectId}/pull-requests/{pullRequestId}/test-definition",
  handler: (request, context) =>
    runHandler(request, context, async (_request, _context, service) =>
      service.getTestDefinition(pullRequestId(request)),
    ),
});
app.http("create-test-run", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "test-runs",
  handler: (request, context) =>
    runHandler(request, context, async (req, _context, service) => {
      const body = startSchema.parse(await req.json());
      return service.start({ ...body, startedBy: principalUserId(req) });
    }),
});
app.http("get-test-run", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "test-runs/{runId}",
  handler: (request, context) =>
    runHandler(request, context, async (_request, _context, service) =>
      service.get(params(request, "runId")),
    ),
});
app.http("get-test-run-items", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "test-runs/{runId}/items",
  handler: (request, context) =>
    runHandler(request, context, async (_request, _context, service) =>
      service.listItems(params(request, "runId")),
    ),
});
app.http("get-test-executions", {
  methods: ["GET"],
  authLevel: "anonymous",
  route: "test-runs/{runId}/items/{itemId}/executions",
  handler: (request, context) =>
    runHandler(request, context, async (_request, _context, service) =>
      service.listExecutions(
        params(request, "runId"),
        params(request, "itemId"),
      ),
    ),
});
app.http("create-test-execution", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "test-runs/{runId}/items/{itemId}/executions",
  handler: (request, context) =>
    runHandler(request, context, async (req, _context, service) => {
      const { comment, ...body } = executionSchema.parse(await req.json());
      const expectedEtag = req.headers.get("if-match");
      if (!expectedEtag) throw new ServiceError(428, "If-Match is required");
      return service.execute(params(req, "runId"), {
        ...body,
        ...(comment ? { comment } : {}),
        itemId: params(req, "itemId"),
        executedBy: principalUserId(req),
        expectedEtag,
      });
    }),
});
app.http("complete-test-run", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "test-runs/{runId}/complete",
  handler: (request, context) =>
    runHandler(request, context, async (req, _context, service) =>
      service.complete(params(req, "runId"), principalUserId(req)),
    ),
});
app.http("reopen-test-run", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "test-runs/{runId}/reopen",
  handler: (request, context) =>
    runHandler(request, context, async (req, _context, service) =>
      service.reopen(params(req, "runId")),
    ),
});
app.http("cancel-test-run", {
  methods: ["POST"],
  authLevel: "anonymous",
  route: "test-runs/{runId}/cancel",
  handler: (request, context) =>
    runHandler(request, context, async (req, _context, service) =>
      service.cancel(params(req, "runId")),
    ),
});
