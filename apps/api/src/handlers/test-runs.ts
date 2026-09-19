import { z } from "zod";
import { type Handler, params, principalUserId } from "../http.js";

const id = z.string().trim().min(1);
const sourceSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("azureRepos"), repositoryId: id, pullRequestId: z.number().int().positive() }),
  z.object({ type: z.literal("github"), repositoryId: id, pullRequestId: z.number().int().positive() }),
  z.object({ type: z.literal("appManaged"), definitionId: id }),
]);
const startSchema = z.object({
  source: sourceSchema.optional(),
  repositoryId: id.optional(),
  pullRequestId: z.number().int().positive().optional(),
  suiteIds: z.array(id).min(1),
});
const listSchema = z.object({
  state: z.enum(["inProgress", "completed", "cancelled"]).optional(),
  result: z.enum(["passed", "failed", "blocked"]).optional(),
  sourceType: z.enum(["azureRepos", "github", "appManaged"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: id.optional(),
});

export const listTestRuns: Handler = async (request, _context, service) => {
  const query = listSchema.parse(Object.fromEntries(request.query.entries()));
  return service.listRuns({
    limit: query.limit,
    ...(query.state ? { state: query.state } : {}),
    ...(query.result ? { result: query.result } : {}),
    ...(query.sourceType ? { sourceType: query.sourceType } : {}),
    ...(query.cursor ? { cursor: query.cursor } : {}),
  });
};

export const createTestRun: Handler = async (request, _context, service) => {
  const body = startSchema.parse(await request.json());
  const input = { suiteIds: body.suiteIds, startedBy: principalUserId(request) };
  if (body.source) return service.start({ ...input, source: body.source });
  return service.start({
    ...input,
    ...(body.repositoryId ? { repositoryId: body.repositoryId } : {}),
    ...(body.pullRequestId ? { pullRequestId: body.pullRequestId } : {}),
  });
};

export const getTestRun: Handler = async (request, _context, service) => service.get(params(request, "runId"));

export const getTestRunItems: Handler = async (request, _context, service) =>
  service.listItems(params(request, "runId"));

export const completeTestRun: Handler = async (request, _context, service) =>
  service.complete(params(request, "runId"), principalUserId(request));

export const reopenTestRun: Handler = async (request, _context, service) => service.reopen(params(request, "runId"));

export const cancelTestRun: Handler = async (request, _context, service) => service.cancel(params(request, "runId"));
