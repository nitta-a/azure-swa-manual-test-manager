import { z } from "zod";
import { type Handler, params, principalUserId } from "../http.js";

const id = z.string().trim().min(1);
const startSchema = z.object({
  repositoryId: id,
  pullRequestId: z.number().int().positive(),
  suiteIds: z.array(id).min(1),
});

export const createTestRun: Handler = async (request, _context, service) => {
  const body = startSchema.parse(await request.json());
  return service.start({ ...body, startedBy: principalUserId(request) });
};

export const getTestRun: Handler = async (request, _context, service) => service.get(params(request, "runId"));

export const getTestRunItems: Handler = async (request, _context, service) =>
  service.listItems(params(request, "runId"));

export const completeTestRun: Handler = async (request, _context, service) =>
  service.complete(params(request, "runId"), principalUserId(request));

export const reopenTestRun: Handler = async (request, _context, service) => service.reopen(params(request, "runId"));

export const cancelTestRun: Handler = async (request, _context, service) => service.cancel(params(request, "runId"));
