import { testItemSelectionId } from "@manual-test-manager/domain";
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
    order: number;
    applicationId?: string;
    applicationTitle?: string;
    featureId?: string;
    featureTitle?: string;
    sourcePath?: string;
    sourceContent?: string;
    sourceUrl?: string;
    items: Array<{
      id: string;
      hierarchy: string[];
      text: string;
      order: number;
      suiteOrder: number;
      inScope?: boolean;
    }>;
  }>;
}

async function resolveRepository(
  context: ServiceContext,
  type: Extract<SourceControlProviderKind, "azureRepos" | "github">,
  repositoryId: string,
  pullRequestId: number,
  suiteIds: string[],
  expectedVersion?: string,
): Promise<ResolvedTestDefinition> {
  const client = context.providers[type];
  if (!client) throw new ServiceError(503, `${type} is not configured`);
  const pullRequest = await client.getPullRequest(pullRequestId);
  checkVersion(expectedVersion, pullRequest.sourceCommitId);
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
        order: manifest.suites.findIndex((entry) => entry.id === suite.id),
        ...(suite.applicationId ? { applicationId: suite.applicationId } : {}),
        ...(suite.applicationTitle ? { applicationTitle: suite.applicationTitle } : {}),
        ...(suite.featureId ? { featureId: suite.featureId } : {}),
        ...(suite.featureTitle ? { featureTitle: suite.featureTitle } : {}),
        sourcePath: suite.path,
        sourceContent,
        ...(client.getFileUrl ? { sourceUrl: client.getFileUrl(suite.path, pullRequest.sourceCommitId) } : {}),
        items: parsed.items.map((item, order) => ({
          ...item,
          id: testItemSelectionId(suite.id, String(order)),
          order,
          suiteOrder: manifest.suites.findIndex((entry) => entry.id === suite.id),
        })),
      };
    }),
  );
  return { source: { type, repositoryId, pullRequest }, suites };
}

async function resolveAppManaged(
  context: ServiceContext,
  definitionId: string,
  suiteIds: string[],
  expectedVersion?: string,
): Promise<ResolvedTestDefinition> {
  const definition = await context.repositories.definitions.get(context.projectId, definitionId);
  if (!definition || definition.value.archived) throw new ServiceError(404, "test definition not found");
  const revision = await context.repositories.definitionRevisions.get(definitionId, definition.value.currentRevisionId);
  if (!revision) throw new ServiceError(404, "test definition revision not found");
  checkVersion(expectedVersion, revision.value.id);
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
      order: suite.value.order,
      ...(suite.value.applicationId ? { applicationId: suite.value.applicationId } : {}),
      ...(suite.value.applicationTitle ? { applicationTitle: suite.value.applicationTitle } : {}),
      ...(suite.value.featureId ? { featureId: suite.value.featureId } : {}),
      ...(suite.value.featureTitle ? { featureTitle: suite.value.featureTitle } : {}),
      items: items
        .filter((item) => item.value.suiteId === suite.value.id)
        .map((item) => ({
          id: testItemSelectionId(suite.value.id, item.value.id),
          hierarchy: item.value.hierarchy,
          text: item.value.text,
          order: item.value.order,
          suiteOrder: suite.value.order,
        })),
    })),
  };
}

export function resolveTestDefinition(
  context: ServiceContext,
  source: DefinitionSource,
  suiteIds: string[],
  itemIds?: string[],
  expectedVersion?: string,
): Promise<ResolvedTestDefinition> {
  const resolved =
    source.type === "appManaged"
      ? resolveAppManaged(context, source.definitionId, suiteIds, expectedVersion)
      : resolveRepository(context, source.type, source.repositoryId, source.pullRequestId, suiteIds, expectedVersion);
  if (!itemIds) return resolved;
  return resolved.then((definition) => {
    const available = new Set(definition.suites.flatMap((suite) => suite.items.map((item) => item.id)));
    if (itemIds.some((id) => !available.has(id)))
      throw new ServiceError(400, "one or more item ids are not in the selected suites");
    const selectedIds = new Set(itemIds);
    if (selectedIds.size === 0) throw new ServiceError(400, "select at least one test item");
    return {
      ...definition,
      suites: definition.suites.map((suite) => ({
        ...suite,
        items: suite.items.map((item) => ({ ...item, inScope: selectedIds.has(item.id) })),
      })),
    };
  });
}

function checkVersion(expected: string | undefined, actual: string) {
  if (expected && expected !== actual)
    throw new ServiceError(409, "test definition changed; reload and select the test items again");
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
  const suites = await Promise.all(
    manifest.suites.map(async (suite) => {
      const sourceMarkdown = await client.getFile(suite.path, pullRequest.sourceCommitId);
      return {
        ...suite,
        sourceMarkdown,
        ...(client.getFileUrl ? { sourceUrl: client.getFileUrl(suite.path, pullRequest.sourceCommitId) } : {}),
        order: manifest.suites.findIndex((entry) => entry.id === suite.id),
        items: parseTestMarkdown(sourceMarkdown).items.map((item, order) => ({
          ...item,
          id: testItemSelectionId(suite.id, String(order)),
          order,
        })),
      };
    }),
  );
  return { pullRequest, manifest, suites, provider, repositoryId };
}
