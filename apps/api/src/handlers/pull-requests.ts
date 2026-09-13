import { type Handler, pullRequestId } from "../http.js";

export const listPullRequests: Handler = async (_request, _context, service) => service.listPullRequests();

export const getPullRequest: Handler = async (request, _context, service) =>
  service.getPullRequest(pullRequestId(request));

export const getTestDefinition: Handler = async (request, _context, service) =>
  service.getTestDefinition(pullRequestId(request));
