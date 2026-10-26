import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, type RunDetails } from "../../api";

export function usePullRequest() {
  const { pullRequestId = "" } = useParams();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const provider = params.get("provider") === "github" ? "github" : "azureRepos";
  const selectedRepositoryId =
    provider === "github"
      ? import.meta.env.VITE_GITHUB_REPOSITORY || "repository"
      : import.meta.env.VITE_REPOSITORY_ID || "repository";
  const [selection, setSelection] = useState<{ key: string; ids: string[] }>({ key: "", ids: [] });
  const [details, setDetails] = useState({
    releaseName: "",
    environmentUrl: "",
    makerVersion: "",
    viewerVersion: "",
    functionsVersion: "",
    appVersionBefore: "",
    appVersionAfter: "",
    browser: "",
    operatingSystem: "",
    locale: "",
    featureConfiguration: "",
  });
  const definition = useQuery({
    queryKey: ["definition", provider, pullRequestId],
    queryFn: () => api.getDefinition(pullRequestId, provider),
    enabled: Boolean(pullRequestId),
    staleTime: Infinity,
  });
  const selectionKey = `${provider}:${pullRequestId}:${definition.data?.pullRequest.sourceCommitId}`;
  const selectedItemIds = selection.key === selectionKey ? selection.ids : [];
  function setSelectedItemIds(update: (ids: string[]) => string[]) {
    setSelection((current) => ({
      key: selectionKey,
      ids: update(current.key === selectionKey ? current.ids : []),
    }));
  }
  const selected = useMemo(() => {
    const ids = new Set(selectedItemIds);
    return (
      definition.data?.suites
        .filter((suite) => suite.items.some((item) => ids.has(item.id)))
        .map((suite) => suite.id) || []
    );
  }, [definition.data, selectedItemIds]);
  const startRun = useMutation({
    mutationFn: () =>
      api.startRun(
        { type: provider, repositoryId: selectedRepositoryId, pullRequestId: Number(pullRequestId) },
        selected,
        selectedItemIds,
        Object.fromEntries(Object.entries(details).filter(([, value]) => value.trim())) as Partial<RunDetails>,
        definition.data?.pullRequest.sourceCommitId,
      ),
    onSuccess: (run) => navigate(`/test-runs/${run.value.id}`),
  });

  function setSelectedItems(itemIds: string[]) {
    setSelectedItemIds(() => itemIds);
  }

  function setDetail<K extends keyof typeof details>(key: K, value: string) {
    setDetails((current) => ({ ...current, [key]: value }));
  }

  return { definition, selected, selectedItemIds, startRun, setSelectedItems, details, setDetail };
}
