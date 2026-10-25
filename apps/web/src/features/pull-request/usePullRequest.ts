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
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
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
  });
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
      ),
    onSuccess: (run) => navigate(`/test-runs/${run.value.id}`),
  });

  function toggleSuite(suiteId: string, checked: boolean) {
    const suite = definition.data?.suites.find((entry) => entry.id === suiteId);
    if (!suite) return;
    const itemIds = suite.items.map((item) => item.id);
    setSelectedItemIds((current) =>
      checked ? [...new Set([...current, ...itemIds])] : current.filter((itemId) => !itemIds.includes(itemId)),
    );
  }

  function toggleItem(itemId: string, checked: boolean) {
    setSelectedItemIds((current) =>
      checked ? [...new Set([...current, itemId])] : current.filter((id) => id !== itemId),
    );
  }

  function toggleItems(itemIds: string[], checked: boolean) {
    setSelectedItemIds((current) =>
      checked ? [...new Set([...current, ...itemIds])] : current.filter((id) => !itemIds.includes(id)),
    );
  }

  function setDetail<K extends keyof typeof details>(key: K, value: string) {
    setDetails((current) => ({ ...current, [key]: value }));
  }

  return { definition, selected, selectedItemIds, startRun, toggleSuite, toggleItem, toggleItems, details, setDetail };
}
