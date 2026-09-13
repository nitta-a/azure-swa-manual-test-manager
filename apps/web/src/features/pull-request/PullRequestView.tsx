import { ErrorMessage } from "../shared/ErrorMessage";
import { Page } from "../shared/Page";
import { usePullRequest } from "./usePullRequest";

export function PullRequestView() {
  const { definition, selected, startRun, toggleSuite } = usePullRequest();
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
                <label className="check" key={suite.id}>
                  <input
                    type="checkbox"
                    checked={selected.includes(suite.id)}
                    onChange={(event) => toggleSuite(suite.id, event.target.checked)}
                  />
                  {suite.title}
                  <small>{suite.path}</small>
                </label>
              ))}
            </fieldset>
            <button
              type="button"
              disabled={selected.length === 0 || startRun.isPending}
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
