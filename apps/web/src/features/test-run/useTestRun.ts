import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, type Item } from "../../api";

export function useTestRun() {
  const { runId = "" } = useParams();
  const navigate = useNavigate();
  const client = useQueryClient();
  const [historyItem, setHistoryItem] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
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
    mutationFn: ({ item, status, comment }: { item: Item; status: string; comment?: string }) =>
      api.execute(runId, item.value.id, item.etag, status, comment),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["run", runId] });
      client.invalidateQueries({ queryKey: ["executions", runId] });
      client.invalidateQueries({ queryKey: ["test-runs"] });
    },
    onError: (error: Error & { status?: number }) => {
      if (error.status !== 409) return;
      setConflict(true);
      client.invalidateQueries({ queryKey: ["run", runId] });
    },
  });
  const complete = useMutation({
    mutationFn: () => api.complete(runId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["run", runId] });
      client.invalidateQueries({ queryKey: ["test-runs"] });
      navigate("/test-runs");
    },
  });
  const cancel = useMutation({
    mutationFn: () => api.cancel(runId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["test-runs"] });
      navigate("/test-runs");
    },
  });
  const reopen = useMutation({
    mutationFn: () => api.reopen(runId),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["run", runId] });
      client.invalidateQueries({ queryKey: ["test-runs"] });
    },
  });

  return {
    run,
    history,
    execute,
    complete,
    cancel,
    reopen,
    conflict,
    clearConflict: () => setConflict(false),
    historyItem,
    showHistory: setHistoryItem,
    closeHistory: () => setHistoryItem(null),
  };
}
