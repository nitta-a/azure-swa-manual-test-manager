import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../../api";

export function usePullRequest() {
  const { pullRequestId = "" } = useParams();
  const navigate = useNavigate();
  const [selected, setSelected] = useState<string[]>([]);
  const definition = useQuery({
    queryKey: ["definition", pullRequestId],
    queryFn: () => api.getDefinition(pullRequestId),
    enabled: Boolean(pullRequestId),
  });
  const startRun = useMutation({
    mutationFn: () => api.startRun(Number(pullRequestId), selected),
    onSuccess: (run) => navigate(`/test-runs/${run.value.id}`),
  });

  function toggleSuite(suiteId: string, checked: boolean) {
    setSelected((current) =>
      checked ? (current.includes(suiteId) ? current : [...current, suiteId]) : current.filter((id) => id !== suiteId),
    );
  }

  return { definition, selected, startRun, toggleSuite };
}
