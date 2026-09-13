# manual-test-manager

Azure Repos の Markdown を正本にして、Pull Request 単位の手動テスト実施と履歴を管理する MVP です。

候補名は `manual-test-manager`、`test-runner-hub`、`repo-test-board` の3案を比較し、Azure DevOps に限定せず将来の別 SCM adapter を追加できる `manual-test-manager` を採用しました。

## 構成

- `apps/web`: React + Vite + TypeScript、React Router、TanStack Query
- `apps/api`: Azure Functions v4 / Static Web Apps Managed Functions 用 HTTP API
- `packages/domain`: 外部フレームワークに依存しない型と結果判定
- `packages/manifest`: manifest v1 の YAML 読み込み・検証
- `packages/markdown-parser`: Heading / 既存ネスト形式の Markdown parser
- `packages/azure-devops`: 設定注入型の Azure DevOps REST client
- `packages/storage`: repository interface、インメモリ実装、Azure Table Storage adapter

すべての package は開始時点では private です。

## 開発環境

Node.js 22 系と pnpm 10 を使用します。

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

## 環境変数

API 側だけが次の値を読み込みます。PAT はブラウザへ渡しません。

| variable | purpose |
| --- | --- |
| `ADO_ORGANIZATION_URL` | Azure DevOps organization URL |
| `ADO_PROJECT` | Azure DevOps project |
| `ADO_REPOSITORY_ID` | repository id |
| `ADO_PAT` | API server の Application Settings に置く PAT |
| `AZURE_STORAGE_CONNECTION_STRING` | Azure Table Storage または Azurite |
| `MANIFEST_PATH` | manifest の Repos 上のパス。既定値は `.manual-test-manifest.yml` |
| `VITE_PROJECT_ID` | web が表示する project id |
| `VITE_REPOSITORY_ID` | TestRun 作成時の repository id |

Production と preview は別の Static Web Apps / Application Settings とし、local の秘密はコミットしません。

## manifest v1

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

## 認証と Static Web Apps

SWA は Standard plan とし、Entra ID の Custom Authentication は対象テナントに限定する設定をポータルまたはデプロイ設定で行います。`staticwebapp.config.json` は authenticated role のみを許可します。API は SWA の `x-ms-client-principal` をユーザー identity の信頼境界として読み取り、authorization を追加できる形です。

## MVP の境界

実装済みの中心フローは、PR 一覧 → PR の suite 一覧 → suite 選択 → commit snapshot 固定 → PASS / FAIL / BLOCKED / SKIPPED → execution 履歴閲覧です。TestRunItem の更新は `If-Match` と Azure Table の ETag で競合を検知します。

PR の HEAD 更新後も既存 Run は変化しません。同じ commit でも新しい Run を作成できます。完了後は read-only、reopen は snapshot を維持したまま inProgress に戻し、PR の HEAD 更新には使いません。

MVP 外: 変更ファイルからの suite 推薦、恒久的 TestCase ID、長期分析、担当者割当、添付、AI、PR status / branch policy、Teams 通知、Markdown 編集、GitHub adapter。
