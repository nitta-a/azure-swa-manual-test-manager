import { groupByChapter } from "../shared/chapters";
import { ErrorMessage } from "../shared/ErrorMessage";
import { Page } from "../shared/Page";
import { RunMetadataFields } from "../shared/RunMetadataFields";
import { usePullRequest } from "./usePullRequest";

export function PullRequestView() {
  const { definition, selectedItemIds, startRun, toggleSuite, toggleItem, toggleItems, details, setDetail } =
    usePullRequest();
  const title = definition.data
    ? `#${definition.data.pullRequest.id} ${definition.data.pullRequest.title}`
    : "PR details";

  return (
    <Page title={title}>
      <ErrorMessage error={definition.error || startRun.error} />
      {definition.isPending ? (
        <p>読み込み中…</p>
      ) : (
        definition.data && (
          <>
            <p>
              commit: <code>{definition.data.pullRequest.sourceCommitId}</code>
            </p>
            <fieldset>
              <legend>実施するSuiteを選択</legend>
              {definition.data.suites.map((suite) => (
                <div className="suite-selection" key={suite.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={suite.items.length > 0 && suite.items.every((item) => selectedItemIds.includes(item.id))}
                      onChange={(event) => toggleSuite(suite.id, event.target.checked)}
                    />
                    {suite.title}
                    <small>{suite.path}</small>
                  </label>
                  <details className="source-preview">
                    <summary>原文 Markdown を参照</summary>
                    <pre>{suite.sourceMarkdown}</pre>
                  </details>
                  {groupByChapter(suite.items, (item) => item.hierarchy).map((group) => (
                    <div className="chapter" key={group.items[0]?.id || group.title}>
                      {group.title && (
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={group.items.every((item) => selectedItemIds.includes(item.id))}
                            onChange={(event) =>
                              toggleItems(
                                group.items.map((item) => item.id),
                                event.target.checked,
                              )
                            }
                          />
                          {group.title}
                        </label>
                      )}
                      {group.items.map((item) => (
                        <label className="check" key={item.id}>
                          <input
                            type="checkbox"
                            checked={selectedItemIds.includes(item.id)}
                            onChange={(event) => toggleItem(item.id, event.target.checked)}
                          />
                          {item.hierarchy.length > 1 ? `${item.hierarchy.slice(1).join(" / ")} / ` : ""}
                          {item.text}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </fieldset>
            <RunMetadataFields details={details} onChange={setDetail} />
            <button
              type="button"
              disabled={selectedItemIds.length === 0 || startRun.isPending}
              onClick={() => startRun.mutate()}
            >
              テスト開始
            </button>
          </>
        )
      )}
    </Page>
  );
}
