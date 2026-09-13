# Architecture

```text
Static Web Apps Standard
├── React/Vite web
│   └── /api only
└── Managed Functions API
    ├── Entra/SWA client principal boundary
    ├── AzureDevOpsClient
    │   └── PAT from API Application Settings
    ├── manifest + markdown parser
    └── RepositorySet
        ├── TestRuns        PK=repositoryId, RK=runId
        ├── TestRunSuites   PK=runId, RK=suiteId
        ├── TestRunItems    PK=runId, RK=itemId
        └── TestExecutions  PK=runId, RK=itemId_executionId
```

## Runtime flow

1. API reads the PR and its source commit.
2. API reads the manifest at that commit and validates manifest v1.
3. The user selects suites; only those Markdown files are fetched with concurrency 5.
4. The parser returns `ParsedTestItem[]`; a run, suite snapshots, and pending items are persisted.
5. Each execution first updates the item with `If-Match`, then appends an immutable execution record. A stale ETag returns conflict instead of silent last-write-wins.
6. Completion requires zero pending items and calculates `failed > blocked > passed`; skipped is not a failure.

The domain package has no Azure, Functions, React, or storage SDK dependency. The Azure DevOps client and Table Storage implementation are adapters behind interfaces, so the API service can be tested with in-memory implementations.

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
```

All timestamps are ISO UTC strings. Request failures include a request id; structured log fields can be extended with `userId`, `runId`, `repositoryId`, and `pullRequestId`.
