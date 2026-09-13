import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, Route, Routes, useNavigate, useParams } from "react-router-dom";
import { api, type Item } from "./api";

function ErrorMessage({ error }: { error: Error | null }) {
  return error ? (
    <p role="alert" className="error">
      {error.message}
    </p>
  ) : null;
}

function PullRequestsPage() {
  const result = useQuery({
    queryKey: ["pull-requests"],
    queryFn: api.listPullRequests,
  });
  return (
    <Page title="Pull requests">
      <ErrorMessage error={result.error} />
      {result.isPending ? (
        <p>読み込み中…</p>
      ) : (
        <ul className="cards">
          {result.data?.map((pr) => (
            <li key={pr.id}>
              <Link to={`/pull-requests/${pr.id}`}>
                <strong>
                  #{pr.id} {pr.title}
                </strong>
                <span>
                  {pr.sourceBranch} → {pr.targetBranch}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

function PullRequestPage() {
  const { pullRequestId = "" } = useParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const result = useQuery({
    queryKey: ["definition", pullRequestId],
    queryFn: () => api.getDefinition(pullRequestId),
    enabled: Boolean(pullRequestId),
  });
  const mutation = useMutation({
    mutationFn: () => api.startRun(Number(pullRequestId), selected),
    onSuccess: (run) => navigate(`/test-runs/${run.value.id}`),
  });
  return (
    <Page
      title={
        result.data
          ? `#${result.data.pullRequest.id} ${result.data.pullRequest.title}`
          : "PR details"
      }
    >
      <ErrorMessage error={result.error || mutation.error} />
      {result.isPending ? (
        <p>読み込み中…</p>
      ) : (
        result.data && (
          <>
            <p>
              commit: <code>{result.data.pullRequest.sourceCommitId}</code>
            </p>
            <fieldset>
              <legend>実施するSuiteを選択</legend>
              {result.data.suites.map((suite) => (
                <label className="check" key={suite.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(suite.id)}
                    onChange={(event) =>
                      setSelected(
                        event.target.checked
                          ? [...selected, suite.id]
                          : selected.filter((id) => id !== suite.id),
                      )
                    }
                  />
                  {suite.title}
                  <small>{suite.path}</small>
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              disabled={selected.length === 0 || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              テスト開始
            </button>
          </>
        )
      )}
    </Page>
  );
}

function RunPage() {
  const { runId = "" } = useParams();
  const client = useQueryClient();
  const [historyItem, setHistoryItem] = useState<string | null>(null);
  const result = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    enabled: Boolean(runId),
  });
  const history = useQuery({
    queryKey: ["executions", runId, historyItem],
    queryFn: () => api.executions(runId, historyItem ?? ""),
    enabled: Boolean(historyItem),
  });
  const execute = useMutation({
    mutationFn: ({ item, status }: { item: Item; status: string }) =>
      api.execute(runId, item.value.id, item.etag, status),
    onSuccess: () => client.invalidateQueries({ queryKey: ["run", runId] }),
  });
  const complete = useMutation({
    mutationFn: () => api.complete(runId),
    onSuccess: () => client.invalidateQueries({ queryKey: ["run", runId] }),
  });
  return (
    <Page title="Test run">
      <ErrorMessage error={result.error || execute.error || complete.error} />
      {result.isPending ? (
        <p>読み込み中…</p>
      ) : (
        result.data && (
          <>
            <p>
              状態: <strong>{result.data.value.state}</strong>{" "}
              {result.data.value.result ? `(${result.data.value.result})` : ""}{" "}
              · snapshot commit: <code>{result.data.value.sourceCommitId}</code>
            </p>
            <ol className="items">
              {result.data.items.map((item) => (
                <li key={item.value.id}>
                  <div>
                    {item.value.hierarchy.length > 0 && (
                      <small>{item.value.hierarchy.join(" / ")}</small>
                    )}
                    <span>{item.value.text}</span>
                    <strong className={`status ${item.value.status}`}>
                      {item.value.status}
                    </strong>
                  </div>
                  <div className="actions">
                    {["passed", "failed", "blocked", "skipped"].map(
                      (status) => (
                        <button
                          type="button"
                          key={status}
                          disabled={
                            result.data?.value.state !== "inProgress" ||
                            execute.isPending
                          }
                          onClick={() => execute.mutate({ item, status })}
                        >
                          {status}
                        </button>
                      ),
                    )}
                    <button
                      type="button"
                      className="quiet"
                      onClick={() => setHistoryItem(item.value.id)}
                    >
                      履歴
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            {result.data.value.state === "inProgress" && (
              <button type="button" onClick={() => complete.mutate()}>
                テスト完了
              </button>
            )}
            {historyItem && (
              <section className="history">
                <h2>Execution history</h2>
                <button
                  type="button"
                  className="quiet"
                  onClick={() => setHistoryItem(null)}
                >
                  閉じる
                </button>
                {history.isPending ? (
                  <p>読み込み中…</p>
                ) : (
                  history.data?.map((entry) => (
                    <p key={entry.value.id}>
                      <strong>{entry.value.status}</strong> ·{" "}
                      {entry.value.executedBy} · {entry.value.executedAt}
                      {entry.value.comment ? ` · ${entry.value.comment}` : ""}
                    </p>
                  ))
                )}
              </section>
            )}
          </>
        )
      )}
    </Page>
  );
}

function Page({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main>
      <nav>
        <Link to="/pull-requests">Manual Test Manager</Link>
      </nav>
      <header>
        <h1>{title}</h1>
      </header>
      {children}
    </main>
  );
}

export function App() {
  return (
    <Routes>
      <Route path="/pull-requests" element={<PullRequestsPage />} />
      <Route
        path="/pull-requests/:pullRequestId"
        element={<PullRequestPage />}
      />
      <Route path="/test-runs/:runId" element={<RunPage />} />
      <Route path="*" element={<PullRequestsPage />} />
    </Routes>
  );
}
