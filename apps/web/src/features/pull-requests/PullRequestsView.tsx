import { Link, useSearchParams } from "react-router-dom";
import { ErrorMessage } from "../shared/ErrorMessage";
import { Page } from "../shared/Page";
import { usePullRequests } from "./usePullRequests";

export function PullRequestsView() {
  const result = usePullRequests();
  const [params, setParams] = useSearchParams();
  const provider = params.get("provider") === "github" ? "github" : "azureRepos";

  return (
    <Page title="Pull requests">
      <label>
        Source:{" "}
        <select value={provider} onChange={(event) => setParams({ provider: event.target.value })}>
          <option value="azureRepos">Azure Repos</option>
          <option value="github">GitHub</option>
        </select>
      </label>
      <p>
        <Link to="/test-definitions">App Managed definitions</Link>
      </p>
      <ErrorMessage error={result.error} />
      {result.isPending ? (
        <p>読み込み中…</p>
      ) : (
        <ul className="cards">
          {result.data?.map((pr) => (
            <li key={pr.id}>
              <Link to={`/pull-requests/${pr.id}?provider=${provider}`}>
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
