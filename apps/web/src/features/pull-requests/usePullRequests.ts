import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { api } from "../../api";

export function usePullRequests() {
  const [params] = useSearchParams();
  const provider = params.get("provider") === "github" ? "github" : "azureRepos";
  return useQuery({
    queryKey: ["pull-requests", provider],
    queryFn: () => api.listPullRequests(provider),
  });
}
