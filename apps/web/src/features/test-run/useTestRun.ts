import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useParams } from "react-router-dom";
import { api, type Item } from "../../api";

export function useTestRun() {
  const { runId = "" } = useParams();
  const client = useQueryClient();
  const [historyItem, setHistoryItem] = useState<string | null>(null);
  const run = useQuery({
    queryKey: ["run", runId],
    queryFn: () => api.getRun(runId),
    enabled: Boolean(runId),
  });
  const history = useQuery({
    queryKey: ["executions", runId, historyItem],
    queryFn: () => api.executions(runId, historyItem ?? ""),
    enabled: Boolean(historyItem),
  });
  const execute = useMutation({
    mutationFn: ({ item, status }: { item: Item; status: string }) =>
      api.execute(runId, item.value.id, item.etag, status),
    onSuccess: () => client.invalidateQueries({ queryKey: ["run", runId] }),
  });
  const complete = useMutation({
    mutationFn: () => api.complete(runId),
    onSuccess: () => client.invalidateQueries({ queryKey: ["run", runId] }),
  });

  return {
    run,
    history,
    execute,
    complete,
    historyItem,
    showHistory: setHistoryItem,
    closeHistory: () => setHistoryItem(null),
  };
}
