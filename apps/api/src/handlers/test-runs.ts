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
