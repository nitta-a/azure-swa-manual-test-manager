# Architecture

```text
Static Web Apps Standard
├── React/Vite web
│   └── /api only
└── Managed Functions API
    ├── Entra/SWA client principal boundary
    ├── TestDefinitionResolver
    │   ├── source-control
    │   │   ├── Azure Repos adapter
    │   │   └── GitHub adapter
    │   └── App Managed revision repositories
    ├── manifest + markdown parser
    └── RepositorySet
        ├── TestRuns        PK=repositoryId, RK=runId
        ├── TestRunSuites   PK=runId, RK=suiteId
        ├── TestRunItems    PK=runId, RK=itemId
        ├── TestExecutions  PK=runId, RK=itemId_executionId
        ├── TestDefinitions         PK=projectId, RK=definitionId
        ├── TestDefinitionRevisions PK=definitionId, RK=revisionId
        ├── TestDefinitionSuites    PK=revisionId, RK=suiteId
        └── TestDefinitionItems     PK=revisionId, RK=itemId
```

## Runtime flow

1. The user chooses Azure Repos, GitHub, or App Managed.
2. `TestDefinitionResolver` reads either a PR HEAD commit or the current App Managed revision.
3. Repository sources validate the manifest and parse only the selected Markdown files.
4. The resolved structured definition becomes a run, suite snapshots, and pending items; later definition changes are never read by that run.
5. Each execution first updates the item with `If-Match`, then appends an immutable execution record. A stale ETag returns conflict instead of silent last-write-wins.
6. Completion requires zero pending items and calculates `failed > blocked > passed`; skipped is not a failure.

The domain package has no Azure, GitHub, Functions, React, or storage SDK dependency. Source-control and Table Storage implementations are adapters behind interfaces, so the API service can be tested with in-memory implementations.

Repository Direct keeps the repository as source of truth. Import creates an App Managed revision with provider, repository, PR, commit, and user provenance; it does not establish synchronization in either direction. App Managed edits create immutable revisions, and the definition current-pointer update uses `If-Match` semantics and returns `409` on conflict.

Definition deletion is an archive operation, so definitions used by historical runs and their immutable run snapshots remain readable.

## API

```text
GET  /api/projects/:projectId/pull-requests
GET  /api/projects/:projectId/pull-requests/:pullRequestId
GET  /api/projects/:projectId/pull-requests/:pullRequestId/test-definition
POST /api/test-runs
GET  /api/test-runs/:runId
GET  /api/test-runs/:runId/items
GET  /api/test-runs/:runId/items/:itemId/executions
POST /api/test-runs/:runId/items/:itemId/executions  (If-Match required)
POST /api/test-runs/:runId/complete
POST /api/test-runs/:runId/reopen
POST /api/test-runs/:runId/cancel
GET  /api/test-definitions
POST /api/test-definitions
GET  /api/test-definitions/:definitionId
PUT  /api/test-definitions/:definitionId
DELETE /api/test-definitions/:definitionId
GET  /api/test-definitions/:definitionId/revisions
PUT  /api/test-definitions/:definitionId/content
POST /api/test-definitions/import
```

All timestamps are ISO UTC strings. Request failures include a request id; structured log fields can be extended with `userId`, `runId`, `repositoryId`, and `pullRequestId`.
