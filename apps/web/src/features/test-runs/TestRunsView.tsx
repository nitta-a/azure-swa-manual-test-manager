import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { api, type TestRunSummary } from "../../api";
import { ErrorMessage } from "../shared/ErrorMessage";
import { Page } from "../shared/Page";

export function TestRunsView() {
  const [params, setParams] = useSearchParams();
  const state = params.get("state") as TestRunSummary["state"] | null;
  const result = params.get("result") as TestRunSummary["result"] | null;
  const sourceType = params.get("sourceType") as TestRunSummary["sourceType"] | null;
  const cursor = params.get("cursor");
  const runs = useQuery({
    queryKey: ["test-runs", state, result, sourceType, cursor],
    queryFn: () =>
      api.listRuns({
        ...(state ? { state } : {}),
        ...(result ? { result } : {}),
        ...(sourceType ? { sourceType } : {}),
        ...(cursor ? { cursor } : {}),
      }),
  });
  const active = runs.data?.items.filter((run) => run.state === "inProgress") || [];
  const recent = runs.data?.items.filter((run) => run.state !== "inProgress") || [];
  const setFilter = (key: "state" | "result" | "sourceType", value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("cursor");
    setParams(next);
  };

  return (
    <Page
      title="テスト実行"
      description="実施中・過去のテストを確認できます。状態や結果で絞り込み、実施中のテストを選ぶと続きから記録できます。"
    >
      <section className="filters" aria-label="テスト実行の絞り込み">
        <label>
          状態
          <select value={state || ""} onChange={(event) => setFilter("state", event.target.value)}>
            <option value="">すべて</option>
            <option value="inProgress">実施中</option>
            <option value="completed">完了</option>
            <option value="cancelled">キャンセル</option>
          </select>
        </label>
        <label>
          結果
          <select value={result || ""} onChange={(event) => setFilter("result", event.target.value)}>
            <option value="">すべて</option>
            <option value="passed">合格</option>
            <option value="failed">不合格</option>
            <option value="blocked">ブロック</option>
          </select>
        </label>
        <label>
          定義の保存先
          <select value={sourceType || ""} onChange={(event) => setFilter("sourceType", event.target.value)}>
            <option value="">すべて</option>
            <option value="azureRepos">Azure Repos</option>
            <option value="github">GitHub</option>
            <option value="appManaged">アプリ内管理</option>
          </select>
        </label>
      </section>
      <ErrorMessage error={runs.error} />
      {runs.isPending ? (
        <p>読み込み中…</p>
      ) : (
        <>
          <RunSection title="実施中" runs={active} action="続きから実施" />
          <RunSection title="最近の実行" runs={recent} action="結果を確認" />
          {!runs.data?.items.length && (
            <p className="empty-state">
              テスト実行はまだありません。上部メニューの「プルリクエスト」から対象を選ぶか、
              「テスト定義」から定義を作成してテストを開始してください。
            </p>
          )}
          {runs.data?.nextCursor && (
            <button
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("cursor", runs.data?.nextCursor || "");
                setParams(next);
              }}
            >
              さらに読み込む
            </button>
          )}
        </>
      )}
    </Page>
  );
}

function RunSection({ title, runs, action }: { title: string; runs: TestRunSummary[]; action: string }) {
  return (
    <section>
      <h2>{title}</h2>
      <ul className="cards">
        {runs.map((run) => (
          <li key={run.runId}>
            <Link to={`/test-runs/${run.runId}`}>
              <strong>
                {run.pullRequestId
                  ? `プルリクエスト #${run.pullRequestId}`
                  : run.definitionId
                    ? `定義 ${run.definitionId}`
                    : `実行 ${run.runId}`}
              </strong>
              <span>
                {sourceLabel(run.sourceType)} · {stateLabel(run.state)}
                {run.result ? ` / ${resultLabel(run.result)}` : ""}
              </span>
              <span className={`run-badge state-${run.state}`}>{stateLabel(run.state)}</span>
              <span>
                {run.releaseName || "リリース未設定"} · {run.environmentUrl || "環境未設定"} ·{" "}
                {run.browser || "ブラウザー未設定"}
              </span>
              {run.result && <span className={`run-badge result-${run.result}`}>{resultLabel(run.result)}</span>}
              <span>
                {run.totalCount - run.pendingCount} / {run.totalCount} 件完了 · 未実施 {run.pendingCount} 件
              </span>
              <div
                className="progress-bar"
                role="progressbar"
                aria-label={`${run.runId} の進捗`}
                aria-valuemin={0}
                aria-valuemax={run.totalCount}
                aria-valuenow={run.totalCount - run.pendingCount}
              >
                <span
                  style={{
                    width: `${run.totalCount ? ((run.totalCount - run.pendingCount) / run.totalCount) * 100 : 0}%`,
                  }}
                />
              </div>
              <span>
                開始者: {run.startedBy} · {formatDate(run.startedAt)}
              </span>
              <span className="link-action">{action}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

function formatDate(value: string): string {
  return new Date(value).toLocaleString("ja-JP");
}

function stateLabel(state: TestRunSummary["state"]): string {
  return { inProgress: "実施中", completed: "完了", cancelled: "キャンセル" }[state];
}

function resultLabel(result: NonNullable<TestRunSummary["result"]>): string {
  return { passed: "合格", failed: "不合格", blocked: "ブロック" }[result];
}

function sourceLabel(source: TestRunSummary["sourceType"]): string {
  return { azureRepos: "Azure Repos", github: "GitHub", appManaged: "アプリ内管理" }[source];
}
