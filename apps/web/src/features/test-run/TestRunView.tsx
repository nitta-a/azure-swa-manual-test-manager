import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import type { Item } from "../../api";
import { ErrorMessage } from "../shared/ErrorMessage";
import { markdownLinks } from "../shared/markdown-links";
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
      `## 手動テスト結果: ${run.data.value.result ? statusLabel(run.data.value.result) : stateLabel(run.data.value.state)}`,
      "",
      `実行: ${runUrl}`,
      `リリース: ${run.data.value.releaseName || "未設定"}`,
      `環境: ${run.data.value.environmentUrl || "未設定"}`,
      `定義: ${run.data.value.sourceCommitId || run.data.value.definitionRevisionId || "未設定"}`,
      ...(
        [
          "makerVersion",
          "viewerVersion",
          "functionsVersion",
          "appVersionBefore",
          "appVersionAfter",
          "browser",
          "operatingSystem",
          "locale",
          "featureConfiguration",
        ] as const
      ).map((key) => `${key}: ${run.data?.value[key] || "未設定"}`),
      `結果: 合格 ${progress.passed} 件、不合格 ${progress.failed} 件、ブロック ${progress.blocked} 件、スキップ ${progress.skipped} 件、未実施 ${progress.pending} 件`,
      `対象外: ${run.data.items.filter((item) => item.value.inScope === false).length} 件`,
      "",
      "### 未解決の不合格・ブロック",
      ...(failedItems.length
        ? failedItems.map(
            (item) =>
              `- ${item.value.hierarchy.join(" / ")} ${item.value.text}: ${item.value.lastComment || "詳細なし"}${item.value.lastIssueTicketUrl ? ` ([障害チケット](${item.value.lastIssueTicketUrl}))` : ""}`,
          )
        : ["- なし"]),
      "",
      "### スキップした項目",
      ...(skippedItems.length
        ? skippedItems.map(
            (item) =>
              `- ${item.value.hierarchy.join(" / ")} ${item.value.text}: ${item.value.lastComment || "理由の記録なし"}`,
          )
        : ["- なし"]),
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
    <Page
      title="テスト実行の詳細"
      description="各項目を実際に確認し、合格・不合格・ブロック・スキップを記録します。不合格・ブロック・スキップには理由を入力してください。証跡や障害チケットのURLも残せます。"
    >
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
              状態: <strong>{stateLabel(run.data.value.state)}</strong>{" "}
              {run.data.value.result ? `（${statusLabel(run.data.value.result)}）` : ""} · テスト定義の版:{" "}
              <code>
                {run.data.value.sourceCommitId || run.data.value.definitionRevisionId || run.data.value.sourceType}
              </code>
            </p>
            <dl className="run-details">
              {(
                [
                  ["リリース", run.data.value.releaseName],
                  ["環境", run.data.value.environmentUrl],
                  ["Maker 版", run.data.value.makerVersion],
                  ["Viewer 版", run.data.value.viewerVersion],
                  ["Functions 版", run.data.value.functionsVersion],
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
                  <summary>{suite.value.title} — 元の Markdown を確認</summary>
                  {markdownLinks(suite.value.sourceMarkdown, suite.value.sourceUrl).length > 0 && (
                    <ul aria-label={`${suite.value.title} のリンク`}>
                      {markdownLinks(suite.value.sourceMarkdown, suite.value.sourceUrl).map((link) => (
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
            <section className="progress" aria-label="テスト実行の進捗">
              <strong>
                {progress.passed + progress.failed + progress.blocked + progress.skipped} /{" "}
                {progress.pending + progress.passed + progress.failed + progress.blocked + progress.skipped} 件完了
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
                  すべて
                </button>
                {(["pending", "passed", "failed", "blocked", "skipped"] as const).map((status) => (
                  <button
                    type="button"
                    className={filter === status ? "selected" : "quiet"}
                    key={status}
                    onClick={() => setFilter(status)}
                  >
                    {statusLabel(status)} {progress[status]}
                  </button>
                ))}
              </div>
            </section>
            <p className="usage-hint">
              各項目を確認し、結果ボタンを押して記録します。不合格・ブロック・スキップの場合は理由が必要です。
              「履歴」から過去の記録も確認できます。
            </p>
            <ol className="items">
              {visibleItems.map((item) => (
                <li key={item.value.id}>
                  <div>
                    {item.value.hierarchy.length > 0 && <small>{item.value.hierarchy.join(" / ")}</small>}
                    <span>{item.value.text}</span>
                    <strong className={`status ${item.value.status}`}>{statusLabel(item.value.status)}</strong>
                    {item.value.lastExecutedBy && (
                      <small>
                        最終実施者: {item.value.lastExecutedBy}
                        {item.value.lastExecutedAt &&
                          ` · ${new Date(item.value.lastExecutedAt).toLocaleString("ja-JP")}`}
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
                        {statusLabel(status)}
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
                        `このテスト実行を完了しますか？\n合格 ${progress.passed} 件\n不合格 ${progress.failed} 件\nブロック ${progress.blocked} 件\nスキップ ${progress.skipped} 件\n\n${metadataReview(run.data?.value || {})}`,
                      )
                    )
                      complete.mutate();
                  }}
                >
                  {progress.pending > 0 ? `${progress.pending}件の未実施テストがあります` : "テストを完了する"}
                </button>
                <button
                  type="button"
                  className="quiet"
                  disabled={cancel.isPending}
                  onClick={() => {
                    if (window.confirm("このテスト実行をキャンセルしますか？現在の結果と実施履歴は保持されます。"))
                      cancel.mutate();
                  }}
                >
                  実行をキャンセル
                </button>
              </>
            )}
            {run.data.value.state === "completed" && (
              <button type="button" disabled={reopen.isPending} onClick={() => reopen.mutate()}>
                再開する
              </button>
            )}
            {run.data.value.state !== "inProgress" && <Link to="/test-runs">実行一覧へ戻る</Link>}
            <button type="button" className="quiet" onClick={copyReport}>
              PR 用の結果概要をコピー
            </button>
            {reportMessage && <p role="status">{reportMessage}</p>}
            {commentTarget && (
              <section className="comment-editor" aria-label="実施結果の記録">
                <h2>{statusLabel(commentTarget.status)}の結果を記録</h2>
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
                  <small>スクリーンショットや動画など、結果を確認できる場所を入力します（任意）。</small>
                  <input
                    aria-label="証跡 URL"
                    type="url"
                    value={evidenceUrl}
                    onChange={(event) => setEvidenceUrl(event.target.value)}
                  />
                </label>
                <label>
                  障害チケット URL
                  <small>不具合に関連するチケットがある場合に入力します（任意）。</small>
                  <input
                    aria-label="障害チケット URL"
                    type="url"
                    value={issueTicketUrl}
                    onChange={(event) => setIssueTicketUrl(event.target.value)}
                  />
                </label>
                <button type="button" className="quiet" onClick={() => setCommentTarget(undefined)}>
                  入力をやめる
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
                  {statusLabel(commentTarget.status)}として保存
                </button>
              </section>
            )}
            {historyItem && (
              <section className="history">
                <h2>実施履歴</h2>
                <button type="button" className="quiet" onClick={closeHistory}>
                  閉じる
                </button>
                {history.isPending ? (
                  <p>読み込み中…</p>
                ) : (
                  history.data?.map((entry) => (
                    <p key={entry.value.id}>
                      <strong>{statusLabel(entry.value.status)}</strong> · {entry.value.executedBy} ·{" "}
                      {new Date(entry.value.executedAt).toLocaleString("ja-JP")}
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

function metadataReview(value: import("../../api").RunDetails): string {
  const fields = [
    ["リリース", value.releaseName],
    ["対象環境", value.environmentUrl],
    ["ブラウザ", value.browser],
    ["Maker版", value.makerVersion],
    ["Viewer版", value.viewerVersion],
    ["Functions版", value.functionsVersion],
    ["アプリ版（変更前）", value.appVersionBefore],
    ["アプリ版（変更後）", value.appVersionAfter],
  ];
  return `記録を確認してください（不要な版は未記録のまま完了できます）:\n${fields.map(([name, content]) => `${name}: ${content || "未記録"}`).join("\n")}`;
}

function statusLabel(status: string): string {
  const labels: Record<string, string> = {
    pending: "未実施",
    passed: "合格",
    failed: "不合格",
    blocked: "ブロック",
    skipped: "スキップ",
  };
  return labels[status] || status;
}

function stateLabel(state: string): string {
  const labels: Record<string, string> = { inProgress: "実施中", completed: "完了", cancelled: "キャンセル" };
  return labels[state] || state;
}
