import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Item } from "../../api";
import { ErrorMessage } from "../shared/ErrorMessage";
import { Page } from "../shared/Page";
import { useTestRun } from "./useTestRun";

const executionStatuses: Array<Exclude<Item["value"]["status"], "pending">> = [
  "passed",
  "failed",
  "blocked",
  "skipped",
];

export function TestRunView() {
  const {
    run,
    history,
    execute,
    complete,
    cancel,
    reopen,
    conflict,
    clearConflict,
    historyItem,
    showHistory,
    closeHistory,
  } = useTestRun();
  const [filter, setFilter] = useState<"all" | Item["value"]["status"]>("all");
  const [commentTarget, setCommentTarget] = useState<{
    item: Item;
    status: Exclude<Item["value"]["status"], "pending">;
  }>();
  const [comment, setComment] = useState("");
  const progress = useMemo(() => {
    const counts = { pending: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 };
    for (const item of run.data?.items || []) counts[item.value.status] += 1;
    return counts;
  }, [run.data?.items]);
  const visibleItems = run.data?.items.filter((item) => filter === "all" || item.value.status === filter) || [];
  const error = run.error || execute.error || complete.error || cancel.error || reopen.error;

  const chooseStatus = (item: Item, status: Exclude<Item["value"]["status"], "pending">) => {
    if (status === "failed" || status === "blocked") {
      setCommentTarget({ item, status });
      setComment("");
    } else execute.mutate({ item, status });
  };

  return (
    <Page title="Test run">
      <ErrorMessage error={error} />
      {conflict && (
        <p role="status" className="error">
          このテスト項目は別のユーザーによって更新されました。最新結果を取得しました。{" "}
          <button type="button" className="quiet" onClick={clearConflict}>
            閉じる
          </button>
        </p>
      )}
      {run.isPending ? (
        <p>読み込み中…</p>
      ) : (
        run.data && (
          <>
            <p>
              状態: <strong>{run.data.value.state}</strong> {run.data.value.result ? `(${run.data.value.result})` : ""}{" "}
              · source snapshot:{" "}
              <code>
                {run.data.value.sourceCommitId || run.data.value.definitionRevisionId || run.data.value.sourceType}
              </code>
            </p>
            <section className="progress" aria-label="Run progress">
              <strong>
                {progress.passed + progress.failed + progress.blocked + progress.skipped} / {run.data.items.length}{" "}
                completed
              </strong>
              <div className="progress-bar" aria-hidden="true">
                <span
                  style={{
                    width: `${run.data.items.length ? ((run.data.items.length - progress.pending) / run.data.items.length) * 100 : 0}%`,
                  }}
                />
              </div>
              <div className="counts">
                <button
                  type="button"
                  className={filter === "all" ? "selected" : "quiet"}
                  onClick={() => setFilter("all")}
                >
                  all
                </button>
                {(["pending", "passed", "failed", "blocked", "skipped"] as const).map((status) => (
                  <button
                    type="button"
                    className={filter === status ? "selected" : "quiet"}
                    key={status}
                    onClick={() => setFilter(status)}
                  >
                    {status} {progress[status]}
                  </button>
                ))}
              </div>
            </section>
            <ol className="items">
              {visibleItems.map((item) => (
                <li key={item.value.id}>
                  <div>
                    {item.value.hierarchy.length > 0 && <small>{item.value.hierarchy.join(" / ")}</small>}
                    <span>{item.value.text}</span>
                    <strong className={`status ${item.value.status}`}>{item.value.status}</strong>
                    {item.value.lastExecutedBy && (
                      <small>
                        Last executed by {item.value.lastExecutedBy} · {item.value.lastExecutedAt}
                      </small>
                    )}
                  </div>
                  <div className="actions">
                    {executionStatuses.map((status) => (
                      <button
                        type="button"
                        key={status}
                        disabled={run.data?.value.state !== "inProgress" || execute.isPending}
                        onClick={() => chooseStatus(item, status)}
                      >
                        {status}
                      </button>
                    ))}
                    <button type="button" className="quiet" onClick={() => showHistory(item.value.id)}>
                      履歴
                    </button>
                  </div>
                </li>
              ))}
            </ol>
            {run.data.value.state === "inProgress" && (
              <>
                <button
                  type="button"
                  disabled={progress.pending > 0 || complete.isPending}
                  title={progress.pending > 0 ? `${progress.pending}件の未実施テストがあります` : undefined}
                  onClick={() => {
                    if (
                      window.confirm(
                        `Complete this test run?\nPassed ${progress.passed}\nFailed ${progress.failed}\nBlocked ${progress.blocked}\nSkipped ${progress.skipped}`,
                      )
                    )
                      complete.mutate();
                  }}
                >
                  {progress.pending > 0 ? `${progress.pending}件の未実施テストがあります` : "Complete test run"}
                </button>
                <button
                  type="button"
                  className="quiet"
                  disabled={cancel.isPending}
                  onClick={() => {
                    if (
                      window.confirm("Cancel this test run? Current results and execution history will be preserved.")
                    )
                      cancel.mutate();
                  }}
                >
                  Cancel run
                </button>
              </>
            )}
            {run.data.value.state === "completed" && (
              <button type="button" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
                Reopen
              </button>
            )}
            {run.data.value.state !== "inProgress" && <Link to="/test-runs">Back to runs</Link>}
            {commentTarget && (
              <section className="comment-editor" aria-label="Execution comment">
                <label>
                  Comment required for {commentTarget.status}
                  <textarea value={comment} onChange={(event) => setComment(event.target.value)} />
                </label>
                <button type="button" className="quiet" onClick={() => setCommentTarget(undefined)}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={!comment.trim() || execute.isPending}
                  onClick={() =>
                    execute.mutate(
                      { item: commentTarget.item, status: commentTarget.status, comment },
                      { onSuccess: () => setCommentTarget(undefined) },
                    )
                  }
                >
                  Save {commentTarget.status}
                </button>
              </section>
            )}
            {historyItem && (
              <section className="history">
                <h2>Execution history</h2>
                <button type="button" className="quiet" onClick={closeHistory}>
                  閉じる
                </button>
                {history.isPending ? (
                  <p>読み込み中…</p>
                ) : (
                  history.data?.map((entry) => (
                    <p key={entry.value.id}>
                      <strong>{entry.value.status}</strong> · {entry.value.executedBy} · {entry.value.executedAt}
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
