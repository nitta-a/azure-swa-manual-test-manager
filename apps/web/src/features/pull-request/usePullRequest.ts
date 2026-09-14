import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api } from "../../api";

export function usePullRequest() {
  const { pullRequestId = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const provider = params.get("provider") === "github" ? "github" : "azureRepos";
  const selectedRepositoryId =
    provider === "github"
      ? import.meta.env.VITE_GITHUB_REPOSITORY || "repository"
      : import.meta.env.VITE_REPOSITORY_ID || "repository";
  const [selected, setSelected] = useState<string[]>([]);
  const definition = useQuery({
    queryKey: ["definition", provider, pullRequestId],
    queryFn: () => api.getDefinition(pullRequestId, provider),
    enabled: Boolean(pullRequestId),
  });
  const startRun = useMutation({
    mutationFn: () =>
      api.startRun(
        { type: provider, repositoryId: selectedRepositoryId, pullRequestId: Number(pullRequestId) },
        selected,
      ),
    onSuccess: (run) => navigate(`/test-runs/${run.value.id}`),
  });

  function toggleSuite(suiteId: string, checked: boolean) {
    setSelected((current) =>
      checked ? (current.includes(suiteId) ? current : [...current, suiteId]) : current.filter((id) => id !== suiteId),
    );
  }

  return { definition, selected, startRun, toggleSuite };
}
