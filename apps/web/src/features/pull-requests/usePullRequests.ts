import { useQuery } from "@tanstack/react-query";
import { api } from "../../api";

export function usePullRequests() {
  return useQuery({
    queryKey: ["pull-requests"],
    queryFn: api.listPullRequests,
  });
}
