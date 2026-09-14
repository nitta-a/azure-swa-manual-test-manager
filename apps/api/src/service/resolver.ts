import { parseManifest } from "@manual-test-manager/manifest";
import { parseTestMarkdown } from "@manual-test-manager/markdown-parser";
import type { PullRequestRef, SourceControlProviderKind } from "@manual-test-manager/source-control";
import type { ServiceContext } from "./context.js";
import { ServiceError } from "./errors.js";

export type DefinitionSource =
  | { type: "azureRepos"; repositoryId: string; pullRequestId: number }
  | { type: "github"; repositoryId: string; pullRequestId: number }
  | { type: "appManaged"; definitionId: string };

export interface ResolvedTestDefinition {
  source:
    | { type: "azureRepos" | "github"; repositoryId: string; pullRequest: PullRequestRef }
    | { type: "appManaged"; definitionId: string; revisionId: string };
  suites: Array<{
    id: string;
    title: string;
    sourcePath?: string;
    sourceContent?: string;
    items: Array<{ id?: string; hierarchy: string[]; text: string; order: number }>;
  }>;
}

async function resolveRepository(
  context: ServiceContext,
  type: Extract<SourceControlProviderKind, "azureRepos" | "github">,
  repositoryId: string,
  pullRequestId: number,
  suiteIds: string[],
): Promise<ResolvedTestDefinition> {
  const client = context.providers[type];
  if (!client) throw new ServiceError(503, `${type} is not configured`);
  const pullRequest = await client.getPullRequest(pullRequestId);
  const manifest = parseManifest(await client.getFile(context.manifestPath, pullRequest.sourceCommitId));
  const selected = manifest.suites.filter((suite) => suiteIds.includes(suite.id));
  if (selected.length !== suiteIds.length) throw new ServiceError(400, "one or more suite ids are not in the manifest");
  const suites = await Promise.all(
    selected.map(async (suite) => {
      const sourceContent = await client.getFile(suite.path, pullRequest.sourceCommitId);
      const parsed = parseTestMarkdown(sourceContent);
      return {
        id: suite.id,
        title: suite.title,
        sourcePath: suite.path,
        sourceContent,
        items: parsed.items.map((item, order) => ({ ...item, order })),
      };
    }),
  );
  return { source: { type, repositoryId, pullRequest }, suites };
}

async function resolveAppManaged(
  context: ServiceContext,
  definitionId: string,
  suiteIds: string[],
): Promise<ResolvedTestDefinition> {
  const definition = await context.repositories.definitions.get(context.projectId, definitionId);
  if (!definition || definition.value.archived) throw new ServiceError(404, "test definition not found");
  const revision = await context.repositories.definitionRevisions.get(definitionId, definition.value.currentRevisionId);
  if (!revision) throw new ServiceError(404, "test definition revision not found");
  const suites = await context.repositories.definitionSuites.listByRevision(revision.value.id);
  const items = await context.repositories.definitionItems.listByRevision(revision.value.id);
  const selected = suites.filter((suite) => suiteIds.includes(suite.value.id));
  if (selected.length !== suiteIds.length)
    throw new ServiceError(400, "one or more suite ids are not in the definition");
  return {
    source: { type: "appManaged", definitionId, revisionId: revision.value.id },
    suites: selected.map((suite) => ({
      id: suite.value.id,
      title: suite.value.title,
      items: items
        .filter((item) => item.value.suiteId === suite.value.id)
        .map((item) => ({
          id: item.value.id,
          hierarchy: item.value.hierarchy,
          text: item.value.text,
          order: item.value.order,
        })),
    })),
  };
}

export function resolveTestDefinition(
  context: ServiceContext,
  source: DefinitionSource,
  suiteIds: string[],
): Promise<ResolvedTestDefinition> {
  if (source.type === "appManaged") return resolveAppManaged(context, source.definitionId, suiteIds);
  return resolveRepository(context, source.type, source.repositoryId, source.pullRequestId, suiteIds);
}

export async function getRepositoryDefinition(
  context: ServiceContext,
  pullRequestId: number,
  provider: "azureRepos" | "github" = "azureRepos",
  repositoryId = "repository",
) {
  const client = context.providers[provider];
  if (!client) throw new ServiceError(503, `${provider} is not configured`);
  const pullRequest = await client.getPullRequest(pullRequestId);
  const manifest = parseManifest(await client.getFile(context.manifestPath, pullRequest.sourceCommitId));
  return { pullRequest, manifest, suites: manifest.suites, provider, repositoryId };
}
