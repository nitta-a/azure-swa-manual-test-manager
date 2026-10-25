# SWA deployment and recovery

## Prerequisites and settings

Use a **Standard** Azure Static Web App, Node.js 22, and the pnpm version in
`package.json`. The repository workflow builds and checks the entire workspace,
then uses `pnpm deploy` to create a standalone production API, including
compiled shared workspace packages and external runtime dependencies.
`apps/api/package.json` points the Functions v4 worker to `dist/index.js`.
Workspace dependencies are injected copies, synchronized after each package
build, so nested dependencies never retain links to the source checkout.

Configure these GitHub **repository variables**:

| Variable | Value |
| --- | --- |
| `AZURE_TENANT_ID` | Entra tenant UUID; required for production deployment |
| `PROJECT_ID` | Same project partition as the API setting |
| `ADO_REPOSITORY_ID` | Same Azure Repos repository as the API setting |
| `GITHUB_REPOSITORY_ID` | GitHub repository identifier, e.g. `owner/repository` |

Create the GitHub `production` environment with appropriate deployment approval
and branch restrictions. Put `AZURE_STATIC_WEB_APPS_API_TOKEN` in its secrets.
PR workflows only verify/package; they do not receive deployment credentials or
deploy a preview backed by production storage. A missing tenant blocks production
deployment; the all-zero tenant used for PR packaging is never deployable.

Set SWA **Application Settings**, separately for each deployment environment:

- `AZURE_STORAGE_CONNECTION_STRING`: production Azure Storage connection string.
  Missing settings cause initialization to fail; there is no memory fallback.
- `NODE_ENV=production`, `AZURE_FUNCTIONS_ENVIRONMENT=Production`,
  `FUNCTIONS_WORKER_RUNTIME=node`.
- `PROJECT_ID`, `MANIFEST_PATH`, and the provider settings in the README.
- `AAD_CLIENT_ID`, `AAD_CLIENT_SECRET`: Entra app registration for this tenant.

Never use `VITE_*` variables for secrets. Only project/repository identifiers are
compiled into the web app. Do not expose a separate public Functions endpoint:
the identity-header trust boundary requires requests to go through SWA.

## Authentication and member restrictions

1. Create a single-tenant Entra app registration with a Web redirect URI
   `https://<your-swa-host>/.auth/login/aad/callback`. Configure the client ID and
   secret as SWA Application Settings, not GitHub build variables.
2. `scripts/prepare-swa.mjs` replaces `TENANT_ID` with the configured tenant UUID.
   It places the resulting `staticwebapp.config.json` at the web artifact root.
   Never upload the unrendered repository config.
3. In SWA role management, invite the responsible testers using provider `aad`
   and custom role **`test-runner`**. They must accept the invitation. Login at
   `/.auth/login/aad`; a user who merely signs in does not receive this role.
4. Both static routes and API reads/writes require `test-runner`. The API also
   verifies `authenticated` and a nonempty user ID in the SWA principal.
   Revoking the custom role removes access.

## Reproduce the deployable artifact

Run from the repository root, with the same non-secret `VITE_*` identifiers used
in CI and the actual tenant UUID:

```sh
pnpm install --frozen-lockfile
pnpm test
pnpm typecheck
pnpm check
pnpm --filter @manual-test-manager/api --prod deploy .artifacts/api
AZURE_TENANT_ID=<tenant-uuid> node scripts/prepare-swa.mjs
NODE_ENV=test node --input-type=module -e 'await import("./.artifacts/api/dist/index.js")'
```

Use fresh `.artifacts/api` and `.artifacts/web` destinations for each packaging run;
existing destinations are rejected rather than mixing old and new output. The preparation
script verifies `host.json`, the API entry point and the compiled workspace
dependencies. CI archives the artifacts with `tar` to preserve dependency
symlinks. Deploy the **prebuilt** `.artifacts/web` and `.artifacts/api` directories
using `Azure/static-web-apps-deploy` with `skip_app_build` and `skip_api_build`;
do not point the managed API at unbuilt TypeScript in `apps/api`.

For local development, use `apps/api/local.settings.example.json`, Azurite,
Azure Functions Core Tools v4 and the SWA CLI. After `pnpm build`, run
`swa start apps/web/dist --api-location apps/api` from the repository root.
Alternatively, run `func start` from `apps/api`, and in a second terminal run
`swa start apps/web/dist --api-devserver-url http://localhost:7071`.
Local identity simulation is not a production authorization test.

## Persistence and recovery

The Run row is published only after suite/item snapshots are written. Failed
snapshot construction does not publish a partial Run. If the final summary write
fails, the committed Run remains recoverable from the list.

Each conditional item replacement includes a durable pending execution
(an outbox) in the **same Azure Table entity**. History creation uses its stable
execution ID and is idempotent. A failed history write or a lost HTTP response
leaves enough data for the next Run/item/history read, result retry, or list
refresh to finish the history and clear the outbox with its exact ETag.
There is no failure-time rollback that could erase another tester's result or
undo a history write whose response was lost. An error response means reload
before retrying: a result may already be durable. Never automatically resubmit
with an old ETag.

Run transitions and definition/item replacements use the SDK's `etag` option.
Missing/wildcard or stale ETags are rejected. Replacement, not merge, removes
old completion metadata when reopening. The prior individual item results and
history remain; the Run's result/completer/completion time are removed.

Summaries are rebuildable projections. Run reads rebuild their summary, and
list reads repair histories and rebuild summaries from committed Run rows
before applying pagination/filters. Storage failures are surfaced, not replaced
with a success or an empty list. This MVP deliberately scans committed Runs
on list reads; for large histories, introduce a durable projection queue/index
before scaling, rather than silently disabling recovery.

The start API requires `expectedDefinitionVersion`. The server resolves one
immutable PR commit/revision, compares it with the selection, and returns 409
without publishing a Run if it changed. Reload and reselect in that case.
Original source links are stored against the Run's commit, including relative
file links and heading fragments. Previously saved Runs without source URLs
can still display their Markdown, but cannot recover missing repository URLs.

## Deployment acceptance checks

- Remove Storage configuration in a non-production test deployment: every API
  use must fail rather than create a memory-only Run. Restore it before testing.
- Confirm anonymous, wrong-tenant, and authenticated non-member access is denied;
  an invited `test-runner` can use both UI and API.
- Load ReleaseCheck, choose its environment/deck/translation chapters, update
  the PR, then start: expect 409 and no new Run. Reload/reselect and verify the
  recorded commit and relative links point at that exact revision.
- Execute from two sessions with the same item ETag: exactly one succeeds; the
  stale attempt is rejected. Refresh to see the winning result.
- Complete/reopen a Run and reload: no Run result/completer/completion time
  remains, while individual results and history are preserved.
- Interrupt a history/summary save and restore storage: reload the Run, history,
  and list; expect one execution per execution ID and matching counts/state.
- Check release/environment/browser in the list, application versions in the PR
  report, and missing metadata in the completion confirmation.

Cloud provisioning, credentials, Entra invitations, and a live deployment must
be performed in your Azure subscription; local packaging does not establish
that those external settings have been applied.
