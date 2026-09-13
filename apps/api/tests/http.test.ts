import { expect, test } from "vitest";
import type { HttpRequest, InvocationContext } from "@azure/functions";
import { createTestExecution } from "../src/handlers/executions.js";
import { createTestRun, getTestRun } from "../src/handlers/test-runs.js";
import { createHttpHandler, principalUserId } from "../src/http.js";
import { ServiceError } from "../src/service.js";
import type { TestRunService } from "../src/service.js";

type RequestOptions = {
  params?: Record<string, string>;
  headers?: Record<string, string>;
  body?: unknown;
};

function request(options: RequestOptions = {}): HttpRequest {
  return {
    headers: new Headers(options.headers),
    params: options.params || {},
    json: async () => options.body,
  } as unknown as HttpRequest;
}

function context(): InvocationContext {
  return { log: () => undefined } as unknown as InvocationContext;
}

test("create-test-run maps the request body and authenticated user", async () => {
  let received: unknown;
  const service = {
    start: async (input: unknown) => {
      received = input;
      return { value: { id: "run-1" } };
    },
  } as unknown as TestRunService;

  const response = await createHttpHandler(
    createTestRun,
    Promise.resolve(service),
  )(
    request({
      headers: { "x-user-id": "alice" },
      body: {
        repositoryId: "repo",
        pullRequestId: 12,
        suiteIds: ["smoke"],
      },
    }),
    context(),
  );

  expect(response.status).toBe(200);
  expect(received).toEqual({
    repositoryId: "repo",
    pullRequestId: 12,
    suiteIds: ["smoke"],
    startedBy: "alice",
  });
  expect(response.jsonBody).toEqual({ value: { id: "run-1" } });
});

test("create-test-execution uses the route item and If-Match header", async () => {
  let received: unknown;
  const service = {
    execute: async (_runId: string, input: unknown) => {
      received = input;
      return { ok: true };
    },
  } as unknown as TestRunService;

  const response = await createHttpHandler(
    createTestExecution,
    Promise.resolve(service),
  )(
    request({
      params: { runId: "run-1", itemId: "route-item" },
      headers: { "if-match": 'W/"1"', "x-user-id": "alice" },
      body: { itemId: "body-item", status: "passed", comment: "done" },
    }),
    context(),
  );

  expect(response.status).toBe(200);
  expect(received).toEqual({
    itemId: "route-item",
    status: "passed",
    comment: "done",
    executedBy: "alice",
    expectedEtag: 'W/"1"',
  });
});

test("invalid input returns a 400 response", async () => {
  const service = {
    start: async () => {
      throw new Error("service must not be called");
    },
  } as unknown as TestRunService;

  const response = await createHttpHandler(
    createTestRun,
    Promise.resolve(service),
  )(
    request({
      headers: { "x-request-id": "request-1" },
      body: { repositoryId: "repo", pullRequestId: "not-a-number" },
    }),
    context(),
  );

  expect(response.status).toBe(400);
  const body = response.jsonBody as {
    error: string;
    details: unknown;
    requestId: string;
  };
  expect(body.error).toBe("invalid request");
  expect(Array.isArray(body.details)).toBe(true);
  expect(body.requestId).toBe("request-1");
});

test("missing If-Match returns 428 without executing the item", async () => {
  const service = {
    execute: async () => {
      throw new Error("service must not be called");
    },
  } as unknown as TestRunService;

  const response = await createHttpHandler(
    createTestExecution,
    Promise.resolve(service),
  )(
    request({
      params: { runId: "run-1", itemId: "item-1" },
      body: { itemId: "item-1", status: "passed" },
    }),
    context(),
  );

  expect(response.status).toBe(428);
  expect((response.jsonBody as { error: string }).error).toBe(
    "If-Match is required",
  );
});

test("resolves the SWA principal and local user fallbacks", () => {
  const principal = Buffer.from(
    JSON.stringify({ userId: "principal-id", userDetails: "user@example.com" }),
  ).toString("base64");

  expect(
    principalUserId(request({ headers: { "x-ms-client-principal": principal } })),
  ).toBe("principal-id");
  expect(
    principalUserId(
      request({
        headers: {
          "x-ms-client-principal": Buffer.from(
            JSON.stringify({ userDetails: "user@example.com" }),
          ).toString("base64"),
        },
      }),
    ),
  ).toBe("user@example.com");
  expect(
    principalUserId(
      request({ headers: { "x-ms-client-principal": "not-base64-json" } }),
    ),
  ).toBe("authenticated-user");
  expect(principalUserId(request({ headers: { "x-user-id": "local-id" } }))).toBe(
    "local-id",
  );
  expect(principalUserId(request())).toBe("local-user");
});

test("maps service and unexpected errors to HTTP responses", async () => {
  const serviceErrorService = {
    get: async () => {
      throw new ServiceError(404, "test run not found");
    },
  } as unknown as TestRunService;
  const serviceErrorResponse = await createHttpHandler(
    getTestRun,
    Promise.resolve(serviceErrorService),
  )(
    request({ params: { runId: "missing" }, headers: { "x-request-id": "request-404" } }),
    context(),
  );

  expect(serviceErrorResponse.status).toBe(404);
  expect(serviceErrorResponse.jsonBody).toEqual({
    error: "test run not found",
    requestId: "request-404",
  });

  const unexpectedErrorService = {
    get: async () => {
      throw new Error("database unavailable");
    },
  } as unknown as TestRunService;
  const unexpectedErrorResponse = await createHttpHandler(
    getTestRun,
    Promise.resolve(unexpectedErrorService),
  )(request({ params: { runId: "run-1" } }), context());

  expect(unexpectedErrorResponse.status).toBe(500);
  expect(
    (unexpectedErrorResponse.jsonBody as { error: string }).error,
  ).toBe("internal server error");
});
