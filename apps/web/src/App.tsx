import { Route, Routes } from "react-router-dom";
import { PullRequestView } from "./features/pull-request/PullRequestView";
import { PullRequestsView } from "./features/pull-requests/PullRequestsView";
import { TestRunView } from "./features/test-run/TestRunView";

export function App() {
  return (
    <Routes>
      <Route path="/pull-requests" element={<PullRequestsView />} />
      <Route path="/pull-requests/:pullRequestId" element={<PullRequestView />} />
      <Route path="/test-runs/:runId" element={<TestRunView />} />
      <Route path="*" element={<PullRequestsView />} />
    </Routes>
  );
}
