import { z } from "zod";
import { type Handler, params, principalUserId } from "../http.js";
import { ServiceError } from "../service.js";

const id = z.string().trim().min(1);
const item = z.object({
  id: id.optional(),
  hierarchy: z.array(z.string()),
  text: id,
  order: z.number().int().nonnegative().optional(),
});
const content = z.object({ suites: z.array(z.object({ id, title: id, items: z.array(item) })) });
const definitionBody = z.object({ name: id, content });

function etag(request: { headers: Headers }): string {
  const value = request.headers.get("if-match");
  if (!value) throw new ServiceError(428, "If-Match is required");
  return value;
}

export const listTestDefinitions: Handler = (_request, _context, service) => service.listTestDefinitions();
export const getTestDefinitionById: Handler = (request, _context, service) =>
  service.getTestDefinitionById(params(request, "definitionId"));
export const listTestDefinitionRevisions: Handler = (request, _context, service) =>
  service.listDefinitionRevisions(params(request, "definitionId"));
export const createTestDefinition: Handler = async (request, _context, service) => {
  const body = definitionBody.parse(await request.json());
  return service.createTestDefinition(body.name, body.content, principalUserId(request));
};
export const updateTestDefinition: Handler = async (request, _context, service) => {
  const body = definitionBody.parse(await request.json());
  return service.updateTestDefinition(
    params(request, "definitionId"),
    body.name,
    body.content,
    principalUserId(request),
    etag(request),
  );
};
export const updateTestDefinitionContent: Handler = async (request, _context, service) => {
  const body = content.parse(await request.json());
  const current = await service.getTestDefinitionById(params(request, "definitionId"));
  return service.updateTestDefinition(
    params(request, "definitionId"),
    current.value.name,
    body,
    principalUserId(request),
    etag(request),
  );
};
export const deleteTestDefinition: Handler = async (request, _context, service) =>
  service.deleteTestDefinition(params(request, "definitionId"), etag(request));
export const importTestDefinition: Handler = async (request, _context, service) => {
  const body = z
    .object({
      provider: z.enum(["azureRepos", "github"]),
      repositoryId: id,
      pullRequestId: z.number().int().positive(),
      suiteIds: z.array(id).min(1),
      name: id,
    })
    .parse(await request.json());
  return service.importTestDefinition(
    { type: body.provider, repositoryId: body.repositoryId, pullRequestId: body.pullRequestId },
    body.suiteIds,
    body.name,
    principalUserId(request),
  );
};
