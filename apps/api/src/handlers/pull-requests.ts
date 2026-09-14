import { type Handler, pullRequestId } from "../http.js";

function provider(request: { url: string }): "azureRepos" | "github" {
  return new URL(request.url || "http://localhost").searchParams.get("provider") === "github" ? "github" : "azureRepos";
}

function repositoryId(request: { url: string }): string {
  return new URL(request.url || "http://localhost").searchParams.get("repositoryId") || "repository";
}

export const listPullRequests: Handler = async (request, _context, service) => {
  const selected = provider(request);
  return selected === "azureRepos" ? service.listPullRequests() : service.listPullRequests(selected);
};

export const getPullRequest: Handler = async (request, _context, service) => {
  const selected = provider(request);
  return selected === "azureRepos"
    ? service.getPullRequest(pullRequestId(request))
    : service.getPullRequest(pullRequestId(request), selected);
};

export const getTestDefinition: Handler = async (request, _context, service) => {
  const selected = provider(request);
  return selected === "azureRepos"
    ? service.getTestDefinition(pullRequestId(request))
    : service.getTestDefinition(pullRequestId(request), selected, repositoryId(request));
};
