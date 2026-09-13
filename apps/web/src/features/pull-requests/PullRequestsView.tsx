import { Link } from "react-router-dom";
import { ErrorMessage } from "../shared/ErrorMessage";
import { Page } from "../shared/Page";
import { usePullRequests } from "./usePullRequests";

export function PullRequestsView() {
  const result = usePullRequests();

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
