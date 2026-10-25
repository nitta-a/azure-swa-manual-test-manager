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
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [issueTicketUrl, setIssueTicketUrl] = useState("");
  const [reportMessage, setReportMessage] = useState("");
  const progress = useMemo(() => {
    const counts = { pending: 0, passed: 0, failed: 0, blocked: 0, skipped: 0 };
    for (const item of run.data?.items || []) if (item.value.inScope !== false) counts[item.value.status] += 1;
    return counts;
  }, [run.data?.items]);
  const visibleItems =
    run.data?.items.filter(
      (item) => item.value.inScope !== false && (filter === "all" || item.value.status === filter),
    ) || [];
  const error = run.error || execute.error || complete.error || cancel.error || reopen.error;

  const chooseStatus = (item: Item, status: Exclude<Item["value"]["status"], "pending">) => {
    setCommentTarget({ item, status });
    setComment("");
    setEvidenceUrl("");
    setIssueTicketUrl("");
  };

  function copyReport() {
    if (!run.data) return;
    const runUrl = `${window.location.origin}${window.location.pathname}`;
    const failedItems = run.data.items.filter(
      (item) => item.value.inScope !== false && ["failed", "blocked"].includes(item.value.status),
    );
    const skippedItems = run.data.items.filter(
      (item) => item.value.inScope !== false && item.value.status === "skipped",
    );
    const lines = [
      `## Manual test run: ${run.data.value.result || run.data.value.state}`,
      "",
      `Run: ${runUrl}`,
      `Release: ${run.data.value.releaseName || "not specified"}`,
      `Environment: ${run.data.value.environmentUrl || "not specified"}`,
      `Results: ${progress.passed} passed, ${progress.failed} failed, ${progress.blocked} blocked, ${progress.skipped} skipped, ${progress.pending} pending`,
      `Out of scope: ${run.data.items.filter((item) => item.value.inScope === false).length}`,
      "",
      "### Unresolved failures",
      ...(failedItems.length
        ? failedItems.map(
            (item) =>
              `- ${item.value.hierarchy.join(" / ")} ${item.value.text}: ${item.value.lastComment || "No details"}${item.value.lastIssueTicketUrl ? ` ([ticket](${item.value.lastIssueTicketUrl}))` : ""}`,
          )
        : ["- None"]),
      "",
      "### Skipped items",
      ...(skippedItems.length
        ? skippedItems.map(
            (item) =>
              `- ${item.value.hierarchy.join(" / ")} ${item.value.text}: ${item.value.lastComment || "No reason recorded"}`,
          )
        : ["- None"]),
    ];
    try {
      navigator.clipboard.writeText(lines.join("\n")).then(
        () => setReportMessage("PR 用の結果概要をコピーしました。"),
        (error: unknown) =>
          setReportMessage(`概要をコピーできませんでした: ${error instanceof Error ? error.message : "unknown error"}`),
      );
    } catch (error) {
      setReportMessage(`概要をコピーできませんでした: ${error instanceof Error ? error.message : "unknown error"}`);
    }
  }

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
              · テスト定義の版:{" "}
              <code>
                {run.data.value.sourceCommitId || run.data.value.definitionRevisionId || run.data.value.sourceType}
              </code>
            </p>
            <dl className="run-details">
              {(
                [
                  ["リリース", run.data.value.releaseName],
                  ["環境", run.data.value.environmentUrl],
                  ["Maker", run.data.value.makerVersion],
                  ["Viewer", run.data.value.viewerVersion],
                  ["Functions", run.data.value.functionsVersion],
                  ["アプリ版（変更前）", run.data.value.appVersionBefore],
                  ["アプリ版（変更後）", run.data.value.appVersionAfter],
                  ["ブラウザ", run.data.value.browser],
                  ["OS", run.data.value.operatingSystem],
                  ["言語", run.data.value.locale],
                  ["契約・機能設定", run.data.value.featureConfiguration],
                ] as Array<[string, string | undefined]>
              )
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{label === "環境" && value ? <a href={value}>{value}</a> : value}</dd>
                  </div>
                ))}
            </dl>
            {run.data.suites.map((suite) =>
              suite.value.sourceMarkdown ? (
                <details className="source-preview" key={suite.value.suiteId}>
                  <summary>{suite.value.title} — 原文 Markdown</summary>
                  {markdownLinks(suite.value.sourceMarkdown).length > 0 && (
                    <ul aria-label={`${suite.value.title} links`}>
                      {markdownLinks(suite.value.sourceMarkdown).map((link) => (
                        <li key={link.url}>
                          <a href={link.url} target="_blank" rel="noreferrer">
                            {link.title}
                          </a>
                        </li>
                      ))}
                    </ul>
                  )}
                  <pre>{suite.value.sourceMarkdown}</pre>
                </details>
              ) : null,
            )}
            <section className="progress" aria-label="Run progress">
              <strong>
                {progress.passed + progress.failed + progress.blocked + progress.skipped} /{" "}
                {progress.pending + progress.passed + progress.failed + progress.blocked + progress.skipped} completed
              </strong>
              <div className="progress-bar" aria-hidden="true">
                <span
                  style={{
                    width: `${
                      progress.pending + progress.passed + progress.failed + progress.blocked + progress.skipped
                        ? (
                            (progress.passed + progress.failed + progress.blocked + progress.skipped) /
                              (progress.pending +
                                progress.passed +
                                progress.failed +
                                progress.blocked +
                                progress.skipped)
                          ) * 100
                        : 0
                    }%`,
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
                    {item.value.lastComment && <small>メモ: {item.value.lastComment}</small>}
                    {item.value.lastEvidenceUrl && <a href={item.value.lastEvidenceUrl}>最新の証跡</a>}
                    {item.value.lastIssueTicketUrl && <a href={item.value.lastIssueTicketUrl}>最新の障害チケット</a>}
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
            {run.data.items.some((item) => item.value.inScope === false) && (
              <details className="excluded-items">
                <summary>
                  対象外の項目（{run.data.items.filter((item) => item.value.inScope === false).length}）
                </summary>
                <ul>
                  {run.data.items
                    .filter((item) => item.value.inScope === false)
                    .map((item) => (
                      <li key={item.value.id}>
                        {item.value.hierarchy.length > 0 ? `${item.value.hierarchy.join(" / ")} / ` : ""}
                        {item.value.text}
                      </li>
                    ))}
                </ul>
              </details>
            )}
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
            <button type="button" className="quiet" onClick={copyReport}>
              PR 用の結果概要をコピー
            </button>
            {reportMessage && <p role="status">{reportMessage}</p>}
            {commentTarget && (
              <section className="comment-editor" aria-label="Execution evidence">
                <h2>{commentTarget.status} の結果を記録</h2>
                <label>
                  {commentTarget.status === "skipped"
                    ? "スキップ理由（必須）"
                    : commentTarget.status === "failed" || commentTarget.status === "blocked"
                      ? "実施メモ（必須）"
                      : "実施メモ（任意）"}
                  <textarea value={comment} onChange={(event) => setComment(event.target.value)} />
                </label>
                <label>
                  証跡 URL
                  <input type="url" value={evidenceUrl} onChange={(event) => setEvidenceUrl(event.target.value)} />
                </label>
                <label>
                  障害チケット URL
                  <input
                    type="url"
                    value={issueTicketUrl}
                    onChange={(event) => setIssueTicketUrl(event.target.value)}
                  />
                </label>
                <button type="button" className="quiet" onClick={() => setCommentTarget(undefined)}>
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={
                    (["failed", "blocked", "skipped"].includes(commentTarget.status) && !comment.trim()) ||
                    execute.isPending
                  }
                  onClick={() =>
                    execute.mutate(
                      {
                        item: commentTarget.item,
                        status: commentTarget.status,
                        ...(comment.trim() ? { comment } : {}),
                        ...(evidenceUrl.trim() ? { evidenceUrl: evidenceUrl.trim() } : {}),
                        ...(issueTicketUrl.trim() ? { issueTicketUrl: issueTicketUrl.trim() } : {}),
                      },
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
                      {entry.value.evidenceUrl ? (
                        <>
                          {" "}
                          · <a href={entry.value.evidenceUrl}>証跡</a>
                        </>
                      ) : (
                        ""
                      )}
                      {entry.value.issueTicketUrl ? (
                        <>
                          {" "}
                          · <a href={entry.value.issueTicketUrl}>障害チケット</a>
                        </>
                      ) : (
                        ""
                      )}
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

function markdownLinks(markdown: string): Array<{ title: string; url: string }> {
  const links = new Map<string, string>();
  for (const match of markdown.matchAll(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g)) {
    const url = match[2];
    if (url) links.set(url, match[1] || url);
  }
  return [...links].map(([url, title]) => ({ title, url }));
}
