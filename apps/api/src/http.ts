import type { HttpRequest, HttpResponseInit, InvocationContext } from "@azure/functions";
import { ETagConflictError } from "@manual-test-manager/storage";
import { z } from "zod";
import { createServiceFromEnvironment } from "./config.js";
import { isLocalEnvironment } from "./environment.js";
import { ServiceError, type TestRunService } from "./service.js";

const servicePromise = createServiceFromEnvironment();

export type Handler = (request: HttpRequest, context: InvocationContext, service: TestRunService) => Promise<unknown>;

export function principalUserId(request: HttpRequest): string {
  const header = request.headers.get("x-ms-client-principal");
  if (!header) {
    if (!isLocalEnvironment()) throw new ServiceError(401, "authentication is required");
    return request.headers.get("x-user-id") || "local-user";
  }
  try {
    const principal = JSON.parse(Buffer.from(header, "base64").toString("utf8")) as {
      userId?: string;
      userDetails?: string;
      userRoles?: string[];
    };
    if (
      !isLocalEnvironment() &&
      (!principal.userId || !Array.isArray(principal.userRoles) || !principal.userRoles.includes("authenticated"))
    )
      throw new ServiceError(401, "invalid authenticated principal");
    if (!isLocalEnvironment() && !principal.userRoles?.includes("test-runner"))
      throw new ServiceError(403, "test-runner membership is required");
    return principal.userId || principal.userDetails || "authenticated-user";
  } catch (error) {
    if (error instanceof ServiceError) throw error;
    if (!isLocalEnvironment()) throw new ServiceError(401, "invalid authenticated principal");
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
  let userId: string | undefined;
  try {
    userId = principalUserId(request);
    return json(200, await handler(request, context, await servicePromise));
  } catch (error) {
    context.log({
      requestId,
      userId,
      runId: request.params.runId,
      repositoryId: request.params.repositoryId,
      pullRequestId: request.params.pullRequestId,
      error,
    });
    if (error instanceof ServiceError) return json(error.status, { error: error.message, requestId });
    if (error instanceof ETagConflictError) return json(409, { error: error.message, requestId });
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
