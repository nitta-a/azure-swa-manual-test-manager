import { Link, useSearchParams } from "react-router-dom";
import { ErrorMessage } from "../shared/ErrorMessage";
import { Page } from "../shared/Page";
import { usePullRequests } from "./usePullRequests";

export function PullRequestsView() {
  const result = usePullRequests();
  const [params, setParams] = useSearchParams();
  const provider = params.get("provider") === "github" ? "github" : "azureRepos";

  return (
    <Page
      title="プルリクエスト"
      description="コード変更に含まれるテスト定義を確認し、実施するテストを選んで開始します。Azure Repos または GitHub を切り替えて対象を探してください。"
    >
      <label>
        リポジトリ:{" "}
        <select value={provider} onChange={(event) => setParams({ provider: event.target.value })}>
          <option value="azureRepos">Azure Repos</option>
          <option value="github">GitHub</option>
        </select>
      </label>
      <p>
        <Link to="/test-definitions">アプリ内のテスト定義を管理する</Link>
      </p>
      <ErrorMessage error={result.error} />
      {result.isPending ? (
        <p>読み込み中…</p>
      ) : result.data?.length ? (
        <ul className="cards">
          {result.data.map((pr) => (
            <li key={pr.id}>
              <Link to={`/pull-requests/${pr.id}?provider=${provider}`}>
                <strong>
                  #{pr.id} {pr.title}
                </strong>
                <span>
                  ブランチ: {pr.sourceBranch} → {pr.targetBranch}
                </span>
                <span className="link-action">テスト項目を選択</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty-state">
          表示できるプルリクエストがありません。接続設定と対象リポジトリを確認してください。
        </p>
      )}
    </Page>
  );
}
