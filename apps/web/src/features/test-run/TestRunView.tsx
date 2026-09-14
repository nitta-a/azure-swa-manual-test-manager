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
  const { run, history, execute, complete, historyItem, showHistory, closeHistory } = useTestRun();

  return (
    <Page title="Test run">
      <ErrorMessage error={run.error || execute.error || complete.error} />
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
            <ol className="items">
              {run.data.items.map((item) => (
                <li key={item.value.id}>
                  <div>
                    {item.value.hierarchy.length > 0 && <small>{item.value.hierarchy.join(" / ")}</small>}
                    <span>{item.value.text}</span>
                    <strong className={`status ${item.value.status}`}>{item.value.status}</strong>
                  </div>
                  <div className="actions">
                    {executionStatuses.map((status) => (
                      <button
                        type="button"
                        key={status}
                        disabled={run.data?.value.state !== "inProgress" || execute.isPending}
                        onClick={() => execute.mutate({ item, status })}
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
              <button type="button" onClick={() => complete.mutate()}>
                テスト完了
              </button>
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
