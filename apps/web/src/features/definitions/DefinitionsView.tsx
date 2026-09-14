import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type ManagedDefinition } from "../../api";
import { ErrorMessage } from "../shared/ErrorMessage";
import { Page } from "../shared/Page";

type DraftSuite = { id: string; title: string; items: Array<{ id?: string; hierarchy: string[]; text: string }> };

export function DefinitionsView() {
  const client = useQueryClient();
  const definitions = useQuery({ queryKey: ["test-definitions"], queryFn: api.listTestDefinitions });
  const [selectedId, setSelectedId] = useState<string>();
  const [name, setName] = useState("New definition");
  const [draftSuites, setDraftSuites] = useState<DraftSuite[]>([
    { id: "default", title: "Default", items: [{ hierarchy: [], text: "New test" }] },
  ]);
  const [provider, setProvider] = useState<"azureRepos" | "github">("azureRepos");
  const repositoryId =
    provider === "github"
      ? import.meta.env.VITE_GITHUB_REPOSITORY || "repository"
      : import.meta.env.VITE_REPOSITORY_ID || "repository";
  const [pullRequestId, setPullRequestId] = useState("1");
  const [suiteIds, setSuiteIds] = useState<string[]>([]);
  const importPullRequests = useQuery({
    queryKey: ["definition-import-pull-requests", provider, repositoryId],
    queryFn: () => api.listPullRequests(provider, repositoryId),
  });
  const importDefinition = useQuery({
    queryKey: ["definition-import-definition", provider, repositoryId, pullRequestId],
    queryFn: () => api.getDefinition(pullRequestId, provider, repositoryId),
    enabled: Boolean(pullRequestId),
  });
  const selected = useQuery({
    queryKey: ["test-definition", selectedId],
    queryFn: () => api.getTestDefinitionById(selectedId || ""),
    enabled: Boolean(selectedId),
  });
  useEffect(() => {
    if (!selected.data) return;
    setDraftSuites(
      selected.data.suites.map((suite) => ({
        id: suite.value.id,
        title: suite.value.title,
        items: selected.data.items
          .filter((item) => item.value.suiteId === suite.value.id)
          .map((item) => ({
            id: item.value.id,
            hierarchy: item.value.hierarchy,
            text: item.value.text,
          })),
      })),
    );
  }, [selected.data]);
  useEffect(() => {
    const firstPullRequest = importPullRequests.data?.[0];
    if (!firstPullRequest) return;
    setPullRequestId((current) =>
      importPullRequests.data?.some((pullRequest) => String(pullRequest.id) === current)
        ? current
        : String(firstPullRequest.id),
    );
  }, [importPullRequests.data]);
  useEffect(() => {
    setSuiteIds(importDefinition.data?.suites.map((suite) => suite.id) || []);
  }, [importDefinition.data]);
  const create = useMutation({
    mutationFn: () => api.createTestDefinition(name, { suites: draftSuites }),
    onSuccess: () => client.invalidateQueries({ queryKey: ["test-definitions"] }),
  });
  const update = useMutation({
    mutationFn: (value: ManagedDefinition) =>
      api.updateTestDefinition(value.value.id, value.etag, name, { suites: draftSuites }),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["test-definitions"] });
      client.invalidateQueries({ queryKey: ["test-definition", selectedId] });
    },
  });
  const start = useMutation({
    mutationFn: (value: ManagedDefinition) =>
      api.startRun(
        { type: "appManaged", definitionId: value.value.id },
        value.suites.map((suite) => suite.value.id),
      ),
    onSuccess: (run) => {
      window.location.href = `/test-runs/${run.value.id}`;
    },
  });
  const importMutation = useMutation({
    mutationFn: () => api.importTestDefinition(provider, repositoryId, Number(pullRequestId), suiteIds, name),
    onSuccess: () => client.invalidateQueries({ queryKey: ["test-definitions"] }),
  });

  return (
    <Page title="App Managed definitions">
      <ErrorMessage
        error={
          definitions.error ||
          selected.error ||
          importPullRequests.error ||
          importDefinition.error ||
          create.error ||
          update.error ||
          start.error ||
          importMutation.error
        }
      />
      <section className="history">
        <h2>Create definition</h2>
        <input aria-label="Definition name" value={name} onChange={(event) => setName(event.target.value)} />
        <button type="button" onClick={() => create.mutate()} disabled={create.isPending}>
          Create
        </button>
        <button
          type="button"
          onClick={() =>
            setDraftSuites((current) => [
              ...current,
              { id: `suite-${current.length + 1}`, title: "New suite", items: [] },
            ])
          }
        >
          Add suite
        </button>
      </section>
      <section className="history">
        <h2>Import from repository</h2>
        <select
          aria-label="Import provider"
          value={provider}
          onChange={(event) => setProvider(event.target.value as typeof provider)}
        >
          <option value="azureRepos">Azure Repos</option>
          <option value="github">GitHub</option>
        </select>
        <input aria-label="Repository" value={repositoryId} readOnly />
        <select
          aria-label="Pull request"
          value={pullRequestId}
          onChange={(event) => setPullRequestId(event.target.value)}
        >
          {importPullRequests.data?.map((pullRequest) => (
            <option key={pullRequest.id} value={pullRequest.id}>
              #{pullRequest.id} {pullRequest.title}
            </option>
          ))}
        </select>
        <fieldset>
          <legend>Suites</legend>
          {importDefinition.data?.suites.map((suite) => (
            <label key={suite.id}>
              <input
                type="checkbox"
                checked={suiteIds.includes(suite.id)}
                onChange={(event) =>
                  setSuiteIds((current) =>
                    event.target.checked ? [...current, suite.id] : current.filter((id) => id !== suite.id),
                  )
                }
              />
              {suite.title}
            </label>
          ))}
        </fieldset>
        <button
          type="button"
          onClick={() => importMutation.mutate()}
          disabled={importMutation.isPending || suiteIds.length === 0}
        >
          Import
        </button>
      </section>
      <ul className="cards">
        {definitions.data?.map((entry) => (
          <li key={entry.value.id}>
            <button
              type="button"
              onClick={() => {
                setSelectedId(entry.value.id);
                setName(entry.value.name);
              }}
            >
              {entry.value.name}
            </button>
          </li>
        ))}
      </ul>
      {selected.data && (
        <section className="history">
          <h2>Edit {selected.data.value.name}</h2>
          <input aria-label="Edit definition name" value={name} onChange={(event) => setName(event.target.value)} />
          {draftSuites.map((suite, suiteIndex) => (
            <fieldset key={suite.id}>
              <legend>{suite.title}</legend>
              <input
                aria-label={`Suite ${suiteIndex + 1} title`}
                value={suite.title}
                onChange={(event) =>
                  setDraftSuites((current) =>
                    current.map((entry, index) =>
                      index === suiteIndex ? { ...entry, title: event.target.value } : entry,
                    ),
                  )
                }
              />
              <button
                type="button"
                onClick={() => setDraftSuites((current) => current.filter((_, index) => index !== suiteIndex))}
              >
                Delete suite
              </button>
              <button
                type="button"
                disabled={suiteIndex === 0}
                onClick={() =>
                  setDraftSuites((current) => {
                    const next = [...current];
                    const [entry] = next.splice(suiteIndex, 1);
                    if (entry) next.splice(suiteIndex - 1, 0, entry);
                    return next;
                  })
                }
              >
                Move up
              </button>
              <button
                type="button"
                disabled={suiteIndex === draftSuites.length - 1}
                onClick={() =>
                  setDraftSuites((current) => {
                    const next = [...current];
                    const [entry] = next.splice(suiteIndex, 1);
                    if (entry) next.splice(suiteIndex + 1, 0, entry);
                    return next;
                  })
                }
              >
                Move down
              </button>
              {suite.items.map((item, itemIndex) => (
                <div key={item.id || `${suite.id}-${itemIndex}`}>
                  <input
                    aria-label={`Suite ${suiteIndex + 1} item ${itemIndex + 1}`}
                    value={item.text}
                    onChange={(event) =>
                      setDraftSuites((current) =>
                        current.map((entry, index) =>
                          index === suiteIndex
                            ? {
                                ...entry,
                                items: entry.items.map((child, childIndex) =>
                                  childIndex === itemIndex ? { ...child, text: event.target.value } : child,
                                ),
                              }
                            : entry,
                        ),
                      )
                    }
                  />
                  <button
                    type="button"
                    disabled={itemIndex === 0}
                    onClick={() =>
                      setDraftSuites((current) =>
                        current.map((entry, index) => {
                          if (index !== suiteIndex) return entry;
                          const items = [...entry.items];
                          const [moved] = items.splice(itemIndex, 1);
                          if (moved) items.splice(itemIndex - 1, 0, moved);
                          return { ...entry, items };
                        }),
                      )
                    }
                  >
                    Move up
                  </button>
                  <button
                    type="button"
                    disabled={itemIndex === suite.items.length - 1}
                    onClick={() =>
                      setDraftSuites((current) =>
                        current.map((entry, index) => {
                          if (index !== suiteIndex) return entry;
                          const items = [...entry.items];
                          const [moved] = items.splice(itemIndex, 1);
                          if (moved) items.splice(itemIndex + 1, 0, moved);
                          return { ...entry, items };
                        }),
                      )
                    }
                  >
                    Move down
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      setDraftSuites((current) =>
                        current.map((entry, index) =>
                          index === suiteIndex
                            ? { ...entry, items: entry.items.filter((_, childIndex) => childIndex !== itemIndex) }
                            : entry,
                        ),
                      )
                    }
                  >
                    Delete item
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setDraftSuites((current) =>
                    current.map((entry, index) =>
                      index === suiteIndex
                        ? { ...entry, items: [...entry.items, { hierarchy: [], text: "New test" }] }
                        : entry,
                    ),
                  )
                }
              >
                Add item
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              setDraftSuites((current) => [
                ...current,
                { id: `suite-${current.length + 1}`, title: "New suite", items: [] },
              ])
            }
          >
            Add suite
          </button>
          <button type="button" onClick={() => update.mutate(selected.data)} disabled={update.isPending}>
            Save revision
          </button>
          <button type="button" onClick={() => start.mutate(selected.data)} disabled={start.isPending}>
            Start test run
          </button>
        </section>
      )}
    </Page>
  );
}
