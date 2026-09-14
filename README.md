# manual-test-manager

## English

An MVP for managing manual test runs and their history from Azure Repos, GitHub, or App Managed test definitions.

We compared three candidates—`manual-test-manager`, `test-runner-hub`, and `repo-test-board`—and chose `manual-test-manager` because it leaves room for future SCM adapters instead of being tied to Azure DevOps.

### Project structure

- `apps/web`: React, Vite, TypeScript, React Router, and TanStack Query
- `apps/api`: HTTP API for Azure Functions v4 / Static Web Apps Managed Functions
- `packages/domain`: Framework-independent types and result evaluation
- `packages/manifest`: YAML loading and validation for manifest v1
- `packages/markdown-parser`: Markdown parser for heading and nested-list formats
- `packages/source-control`: Provider-neutral pull request and file access contract
- `packages/azure-devops`: Config-injected Azure DevOps adapter
- `packages/github`: Config-injected GitHub REST adapter
- `packages/storage`: TestRun and App Managed revision repositories, an in-memory implementation, and an Azure Table Storage adapter

All packages are private at this stage.

### Development

Use Node.js 22 and pnpm 12.

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

When the required environment variables are not set, the local API uses in-memory storage. To use Azure DevOps and Azurite, configure the app from `apps/api/local.settings.example.json`, then start the web app and API with the SWA CLI.

```sh
cp apps/api/local.settings.example.json apps/api/local.settings.json
pnpm --filter @manual-test-manager/web dev
```

Start Azurite when using `AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true`. `VITE_PROJECT_ID` and `VITE_REPOSITORY_ID` are used by the web app's API requests.

### Environment variables

Only the API reads the following values. The PAT is never sent to the browser.

| Variable | Purpose |
| --- | --- |
| `ADO_ORGANIZATION_URL` | Azure DevOps organization URL |
| `ADO_PROJECT` | Azure DevOps project |
| `ADO_REPOSITORY_ID` | Repository ID |
| `ADO_PAT` | PAT stored in the API server's Application Settings |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Table Storage or Azurite |
| `MANIFEST_PATH` | Path to the manifest in Repos; defaults to `.manual-test-manifest.yml` |
| `PROJECT_ID` | Project partition used for App Managed definitions |
| `GITHUB_OWNER` | GitHub owner or organization; leave unset to disable GitHub |
| `GITHUB_REPOSITORY` | GitHub repository name; API-only setting |
| `GITHUB_TOKEN` | GitHub token stored only in API Application Settings |
| `GITHUB_API_URL` | GitHub API base URL; defaults to `https://api.github.com` |
| `VITE_PROJECT_ID` | Project ID displayed by the web app |
| `VITE_REPOSITORY_ID` | Repository ID used when creating a TestRun |
| `VITE_GITHUB_REPOSITORY` | Repository identifier sent for GitHub source requests |

For GitHub, use a fine-grained token with read-only `Contents` and `Pull requests` access for the configured repository. Azure Repos needs a PAT with Code read access. Neither credential is returned to the browser.

Use separate Static Web Apps and Application Settings for production and preview. Do not commit local secrets.

### manifest v1

```yaml
version: 1
suites:
  - id: todo
    title: TODO
    path: tests/manual/todo.md
  - id: auth
    title: 認証
    path: tests/manual/auth.md
```

Once created, `id` is a stable identifier and should not be changed. `title` and `path` may be changed. Duplicate IDs, unsupported versions, empty values, and invalid YAML are rejected before a run starts.

Markdown TestItems are checkbox list items only. Heading-formatted items (`## suite`, `### subgroup`) and existing nested lists are converted to the same `hierarchy` / `text` representation. Normal paragraphs, links, and blockquotes are not treated as items, and the original Markdown is saved as a snapshot when a run starts.

### Authentication and Static Web Apps

Use the Standard plan for SWA and configure Entra ID Custom Authentication, through the portal or deployment settings, to allow only the target tenant. `staticwebapp.config.json` allows only the `authenticated` role. The API reads SWA's `x-ms-client-principal` as the trust boundary for user identity and is structured to support additional authorization.

### MVP scope

The implemented core flow is: list PRs → list suites for a PR → select suites → fix a commit snapshot → record PASS / FAIL / BLOCKED / SKIPPED → view execution history. TestRunItem updates detect conflicts with `If-Match` and the Azure Table ETag.

Existing runs do not change when a PR's HEAD is updated. A new run can be created for the same commit. Completed runs are read-only; reopening a run returns it to `inProgress` while preserving its snapshot, and never uses a newer PR HEAD.

Test definitions have three sources: Azure Repos, GitHub, and App Managed. Repository runs snapshot the selected PR HEAD commit. App Managed stores structured suites/items in immutable revisions; changing the current definition never changes existing runs. Import copies a repository revision into App Managed and records provenance without synchronization.

Out of scope for the MVP: suite recommendations from changed files, permanent TestCase IDs, long-term analytics, assignees, attachments, AI, PR status / branch policies, Teams notifications, repository write-back, webhooks, bidirectional sync, OAuth login, and rich-text editing.

## 日本語

Azure Repos、GitHub、App Managed の test definition を正本にして、手動テスト実施と履歴を管理する MVP です。

候補名は `manual-test-manager`、`test-runner-hub`、`repo-test-board` の3案を比較し、Azure DevOps に限定せず将来の別 SCM adapter を追加できる `manual-test-manager` を採用しました。

### 構成

- `apps/web`: React + Vite + TypeScript、React Router、TanStack Query
- `apps/api`: Azure Functions v4 / Static Web Apps Managed Functions 用 HTTP API
- `packages/domain`: 外部フレームワークに依存しない型と結果判定
- `packages/manifest`: manifest v1 の YAML 読み込み・検証
- `packages/markdown-parser`: Heading / 既存ネスト形式の Markdown parser
- `packages/source-control`: provider-neutral な PR / file access contract
- `packages/azure-devops`: 設定注入型の Azure DevOps adapter
- `packages/github`: 設定注入型の GitHub REST adapter
- `packages/storage`: TestRun と App Managed revision の repository、インメモリ実装、Azure Table Storage adapter

すべての package は開始時点では private です。

### 開発環境

Node.js 22 系と pnpm 12 を使用します。

```sh
pnpm install
pnpm build
pnpm typecheck
pnpm test
```

ローカル API は環境変数が揃わない場合インメモリ保存になります。Azure DevOps と Azurite を使う場合は `apps/api/local.settings.example.json` を元に設定し、SWA CLI から web と API を起動します。

```sh
cp apps/api/local.settings.example.json apps/api/local.settings.json
pnpm --filter @manual-test-manager/web dev
```

`AZURE_STORAGE_CONNECTION_STRING=UseDevelopmentStorage=true` を使用する場合は Azurite を起動してください。`VITE_PROJECT_ID` と `VITE_REPOSITORY_ID` は web の API リクエストに使います。

### 環境変数

API 側だけが次の値を読み込みます。PAT はブラウザへ渡しません。

| 変数 | 用途 |
| --- | --- |
| `ADO_ORGANIZATION_URL` | Azure DevOps organization URL |
| `ADO_PROJECT` | Azure DevOps project |
| `ADO_REPOSITORY_ID` | repository id |
| `ADO_PAT` | API server の Application Settings に置く PAT |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Table Storage または Azurite |
| `MANIFEST_PATH` | manifest の Repos 上のパス。既定値は `.manual-test-manifest.yml` |
| `PROJECT_ID` | App Managed definition の project partition |
| `GITHUB_OWNER` | GitHub owner / organization。未設定なら GitHub を無効化 |
| `GITHUB_REPOSITORY` | GitHub repository 名。API 側だけで使用 |
| `GITHUB_TOKEN` | API Application Settings に置く GitHub token |
| `GITHUB_API_URL` | GitHub API の base URL。既定値は `https://api.github.com` |
| `VITE_PROJECT_ID` | web が表示する project id |
| `VITE_REPOSITORY_ID` | TestRun 作成時の repository id |
| `VITE_GITHUB_REPOSITORY` | GitHub source request に送る repository identifier |

GitHub は対象 repository に対する fine-grained token の read-only `Contents` と `Pull requests` 権限だけを使用します。Azure Repos は Code read 権限の PAT を使用します。どちらの credential もブラウザへ返しません。

Production と preview は別の Static Web Apps / Application Settings とし、local の秘密はコミットしません。

### manifest v1

```yaml
version: 1
suites:
  - id: todo
    title: TODO
    path: tests/manual/todo.md
  - id: auth
    title: 認証
    path: tests/manual/auth.md
```

`id` は一度作成したら変えない安定 ID です。`title` と `path` は変更できます。重複 ID、未対応 version、空値、壊れた YAML は開始前に拒否します。

Markdown の TestItem は checkbox list だけです。Heading 形式（`## suite`、`### subgroup`）と既存のネスト list を同じ `hierarchy` / `text` に変換します。通常段落、リンク、blockquote は項目にせず、実行開始時に元 Markdown を snapshot として保存します。

### 認証と Static Web Apps

SWA は Standard plan とし、Entra ID の Custom Authentication は対象テナントに限定する設定をポータルまたはデプロイ設定で行います。`staticwebapp.config.json` は authenticated role のみを許可します。API は SWA の `x-ms-client-principal` をユーザー identity の信頼境界として読み取り、authorization を追加できる形です。

### MVP の境界

実装済みの中心フローは、PR 一覧 → PR の suite 一覧 → suite 選択 → commit snapshot 固定 → PASS / FAIL / BLOCKED / SKIPPED → execution 履歴閲覧です。TestRunItem の更新は `If-Match` と Azure Table の ETag で競合を検知します。

PR の HEAD 更新後も既存 Run は変化しません。同じ commit でも新しい Run を作成できます。完了後は read-only、reopen は snapshot を維持したまま inProgress に戻し、PR の HEAD 更新には使いません。

Test definition の source は Azure Repos、GitHub、App Managed の3種類です。Repository run は PR HEAD commit を snapshot します。App Managed は structured suites/items と immutable revision を保存し、Import は provenance を残しますが同期は行いません。

MVP 外: 変更ファイルからの suite 推薦、恒久的 TestCase ID、長期分析、担当者割当、添付、AI、PR status / branch policy、Teams 通知、repository write-back、webhook、双方向同期、OAuth login、rich-text 編集。
