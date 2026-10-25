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
    <Page title="Test runs">
      <section className="filters" aria-label="Run filters">
        <label>
          State
          <select value={state || ""} onChange={(event) => setFilter("state", event.target.value)}>
            <option value="">All</option>
            <option value="inProgress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>
        <label>
          Result
          <select value={result || ""} onChange={(event) => setFilter("result", event.target.value)}>
            <option value="">All</option>
            <option value="passed">Passed</option>
            <option value="failed">Failed</option>
            <option value="blocked">Blocked</option>
          </select>
        </label>
        <label>
          Source
          <select value={sourceType || ""} onChange={(event) => setFilter("sourceType", event.target.value)}>
            <option value="">All</option>
            <option value="azureRepos">Azure Repos</option>
            <option value="github">GitHub</option>
            <option value="appManaged">App Managed</option>
          </select>
        </label>
      </section>
      <ErrorMessage error={runs.error} />
      {runs.isPending ? (
        <p>読み込み中…</p>
      ) : (
        <>
          <RunSection title="Active runs" runs={active} action="Continue" />
          <RunSection title="Recent runs" runs={recent} action="View" />
          {!runs.data?.items.length && <p>No test runs found.</p>}
          {runs.data?.nextCursor && (
            <button
              type="button"
              onClick={() => {
                const next = new URLSearchParams(params);
                next.set("cursor", runs.data?.nextCursor || "");
                setParams(next);
              }}
            >
              Load more
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
                  ? `PR #${run.pullRequestId}`
                  : run.definitionId
                    ? `Definition ${run.definitionId}`
                    : run.runId}
              </strong>
              <span>
                {run.sourceType} · {run.state}
                {run.result ? ` / ${run.result}` : ""}
              </span>
              <span className={`run-badge state-${run.state}`}>{run.state}</span>
              <span>
                {run.releaseName || "Release not specified"} · {run.environmentUrl || "Environment not specified"} ·{" "}
                {run.browser || "Browser not specified"}
              </span>
              {run.result && <span className={`run-badge result-${run.result}`}>{run.result}</span>}
              <span>
                {run.totalCount - run.pendingCount} / {run.totalCount} completed · {run.pendingCount} pending
              </span>
              <div
                className="progress-bar"
                role="progressbar"
                aria-label={`${run.runId} progress`}
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
                Started by {run.startedBy} · {formatDate(run.startedAt)}
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
  return new Date(value).toLocaleString();
}
