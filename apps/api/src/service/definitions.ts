import { randomUUID } from "node:crypto";
import type {
  TestDefinition,
  TestDefinitionItem,
  TestDefinitionRevision,
  TestDefinitionSuite,
} from "@manual-test-manager/domain";
import { ETagConflictError } from "@manual-test-manager/storage";
import type { ServiceContext } from "./context.js";
import { ServiceError } from "./errors.js";
import { type DefinitionSource, resolveTestDefinition } from "./resolver.js";

export interface DefinitionContent {
  suites: Array<{
    id: string;
    title: string;
    items: Array<{ id?: string | undefined; hierarchy: string[]; text: string; order?: number | undefined }>;
  }>;
}

function contentRecords(revisionId: string, content: DefinitionContent) {
  const suites: TestDefinitionSuite[] = content.suites.map((suite, order) => ({
    revisionId,
    id: suite.id,
    title: suite.title,
    order,
  }));
  const items: TestDefinitionItem[] = content.suites.flatMap((suite) =>
    suite.items.map((item, order) => ({
      revisionId,
      id: item.id || randomUUID(),
      suiteId: suite.id,
      hierarchy: item.hierarchy,
      text: item.text,
      order: item.order ?? order,
    })),
  );
  return { suites, items };
}

async function saveRevision(
  context: ServiceContext,
  definition: TestDefinition,
  content: DefinitionContent,
  createdBy: string,
  importedFrom?: TestDefinitionRevision["importedFrom"],
) {
  const existing = await context.repositories.definitionRevisions.listByDefinition(definition.id);
  const revision: TestDefinitionRevision = {
    id: randomUUID(),
    definitionId: definition.id,
    revision: existing.reduce((max, entry) => Math.max(max, entry.value.revision), 0) + 1,
    createdBy,
    createdAt: context.now(),
    ...(importedFrom ? { importedFrom } : {}),
  };
  await context.repositories.definitionRevisions.create(revision);
  const records = contentRecords(revision.id, content);
  for (const suite of records.suites) await context.repositories.definitionSuites.create(suite);
  for (const item of records.items) await context.repositories.definitionItems.create(item);
  return revision;
}

export async function list(context: ServiceContext) {
  return context.repositories.definitions.list(context.projectId);
}

export async function get(context: ServiceContext, definitionId: string) {
  const definition = await context.repositories.definitions.get(context.projectId, definitionId);
  if (!definition || definition.value.archived) throw new ServiceError(404, "test definition not found");
  const revision = await context.repositories.definitionRevisions.get(definitionId, definition.value.currentRevisionId);
  if (!revision) throw new ServiceError(404, "test definition revision not found");
  return {
    ...definition,
    revision,
    suites: await context.repositories.definitionSuites.listByRevision(revision.value.id),
    items: await context.repositories.definitionItems.listByRevision(revision.value.id),
  };
}

export async function revisions(context: ServiceContext, definitionId: string) {
  await get(context, definitionId);
  return context.repositories.definitionRevisions.listByDefinition(definitionId);
}

export async function create(context: ServiceContext, name: string, content: DefinitionContent, createdBy: string) {
  const now = context.now();
  const definition: TestDefinition = {
    id: randomUUID(),
    projectId: context.projectId,
    name,
    currentRevisionId: "pending",
    createdBy,
    createdAt: now,
    updatedBy: createdBy,
    updatedAt: now,
  };
  const revision = await saveRevision(context, definition, content, createdBy);
  return context.repositories.definitions.create({ ...definition, currentRevisionId: revision.id });
}

export async function update(
  context: ServiceContext,
  definitionId: string,
  name: string,
  content: DefinitionContent,
  updatedBy: string,
  expectedEtag: string,
) {
  const current = await context.repositories.definitions.get(context.projectId, definitionId);
  if (!current || current.value.archived) throw new ServiceError(404, "test definition not found");
  if (current.etag !== expectedEtag) throw new ServiceError(409, "test definition was changed by another user");
  const revision = await saveRevision(context, current.value, content, updatedBy);
  try {
    return await context.repositories.definitions.update(
      { ...current.value, name, currentRevisionId: revision.id, updatedBy, updatedAt: context.now() },
      expectedEtag,
    );
  } catch (error) {
    if (error instanceof ETagConflictError) throw new ServiceError(409, "test definition was changed by another user");
    throw error;
  }
}

export async function remove(context: ServiceContext, definitionId: string, expectedEtag: string) {
  const current = await context.repositories.definitions.get(context.projectId, definitionId);
  if (!current) throw new ServiceError(404, "test definition not found");
  try {
    return await context.repositories.definitions.update(
      { ...current.value, archived: true, updatedAt: context.now() },
      expectedEtag,
    );
  } catch (error) {
    if (error instanceof ETagConflictError) throw new ServiceError(409, "test definition was changed by another user");
    throw error;
  }
}

export async function importDefinition(
  context: ServiceContext,
  source: DefinitionSource,
  suiteIds: string[],
  name: string,
  importedBy: string,
) {
  if (source.type === "appManaged") throw new ServiceError(400, "import source must be a repository");
  const resolved = await resolveTestDefinition(context, source, suiteIds);
  if (resolved.source.type === "appManaged") throw new ServiceError(400, "import source must be a repository");
  const content: DefinitionContent = {
    suites: resolved.suites.map((suite) => ({ id: suite.id, title: suite.title, items: suite.items })),
  };
  const importedFrom = {
    provider: source.type,
    repositoryId: source.repositoryId,
    pullRequestId: source.pullRequestId,
    commitId: resolved.source.pullRequest.sourceCommitId,
    importedAt: context.now(),
    importedBy,
  } as const;
  return createWithProvenance(context, name, content, importedBy, importedFrom);
}

async function createWithProvenance(
  context: ServiceContext,
  name: string,
  content: DefinitionContent,
  createdBy: string,
  importedFrom: NonNullable<TestDefinitionRevision["importedFrom"]>,
) {
  const now = context.now();
  const definition: TestDefinition = {
    id: randomUUID(),
    projectId: context.projectId,
    name,
    currentRevisionId: "pending",
    createdBy,
    createdAt: now,
    updatedBy: createdBy,
    updatedAt: now,
  };
  const revision = await saveRevision(context, definition, content, createdBy, importedFrom);
  return context.repositories.definitions.create({ ...definition, currentRevisionId: revision.id });
}
