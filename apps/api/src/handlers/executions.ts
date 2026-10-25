import { z } from "zod";
import { type Handler, params, principalUserId } from "../http.js";
import { ServiceError } from "../service.js";

const id = z.string().trim().min(1);
const executionSchema = z.object({
  itemId: id,
  status: z.enum(["passed", "failed", "blocked", "skipped"]),
  comment: z.string().optional(),
  evidenceUrl: z.string().url().optional(),
  issueTicketUrl: z.string().url().optional(),
});

export const getTestExecutions: Handler = async (request, _context, service) =>
  service.listExecutions(params(request, "runId"), params(request, "itemId"));

export const createTestExecution: Handler = async (request, _context, service) => {
  const { comment, evidenceUrl, issueTicketUrl, ...body } = executionSchema.parse(await request.json());
  const expectedEtag = request.headers.get("if-match");
  if (!expectedEtag) throw new ServiceError(428, "If-Match is required");
  return service.execute(params(request, "runId"), {
    ...body,
    ...(comment ? { comment } : {}),
    ...(evidenceUrl ? { evidenceUrl } : {}),
    ...(issueTicketUrl ? { issueTicketUrl } : {}),
    itemId: params(request, "itemId"),
    executedBy: principalUserId(request),
    expectedEtag,
  });
};
