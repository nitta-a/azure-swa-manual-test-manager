import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { z } from "zod";
import { createServiceFromEnvironment } from "./config.js";
import { ServiceError, type TestRunService } from "./service.js";

const servicePromise = createServiceFromEnvironment();

export type Handler = (request: HttpRequest, context: InvocationContext, service: TestRunService) => Promise<unknown>;

export function principalUserId(request: HttpRequest): string {
  const header = request.headers.get("x-ms-client-principal");
  if (!header) return request.headers.get("x-user-id") || "local-user";
  try {
    const principal = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as {
      userId?: string;
      userDetails?: string;
    };
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
  servicePromise: Promise<TestRunService>,
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
    if (error instanceof ServiceError) return json(error.status, { error: error.message, requestId });
    if (error instanceof z.ZodError)
      return json(400, {
        error: "invalid request",
        details: error.issues,
        requestId,
      });
    return json(500, { error: "internal server error", requestId });
  }
}

export function createHttpHandler(handler: Handler, service: Promise<TestRunService> = servicePromise) {
  return (request: HttpRequest, context: InvocationContext) => runHandler(request, context, handler, service);
}

export const params = (request: HttpRequest, name: string): string => request.params[name] || "";

export const pullRequestId = (request: HttpRequest): number =>
  z.coerce.number().int().positive().parse(params(request, "pullRequestId"));
