import { testItemSelectionId } from "@manual-test-manager/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { api, type ManagedDefinition, type RunDetails } from "../../api";
import { groupByChapter } from "../shared/chapters";
import { ErrorMessage } from "../shared/ErrorMessage";
import { Page } from "../shared/Page";
import { RunMetadataFields } from "../shared/RunMetadataFields";

type DraftSuite = { id: string; title: string; items: Array<{ id?: string; hierarchy: string[]; text: string }> };

export function DefinitionsView() {
  const client = useQueryClient();
  const definitions = useQuery({ queryKey: ["test-definitions"], queryFn: api.listTestDefinitions });
  const [selectedId, setSelectedId] = useState<string>();
  const [runItemIds, setRunItemIds] = useState<string[]>([]);
  const [runDetails, setRunDetails] = useState<RunDetails>({});
  const [name, setName] = useState("新しいテスト定義");
  const [draftSuites, setDraftSuites] = useState<DraftSuite[]>([
    { id: "default", title: "基本テスト", items: [{ hierarchy: [], text: "新しいテスト項目" }] },
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
    staleTime: Infinity,
  });
  useEffect(() => {
    if (!selected.data) return;
    setRunItemIds(selected.data.items.map((item) => testItemSelectionId(item.value.suiteId, item.value.id)));
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
    mutationFn: (value: ManagedDefinition) => {
      const selectedItems = value.items.filter((item) =>
        runItemIds.includes(testItemSelectionId(item.value.suiteId, item.value.id)),
      );
      return api.startRun(
        { type: "appManaged", definitionId: value.value.id },
        [...new Set(selectedItems.map((item) => item.value.suiteId))],
        selectedItems.map((item) => testItemSelectionId(item.value.suiteId, item.value.id)),
        runDetails,
        value.value.currentRevisionId,
      );
    },
    onSuccess: (run) => {
      window.location.href = `/test-runs/${run.value.id}`;
    },
  });
  const importMutation = useMutation({
    mutationFn: () => api.importTestDefinition(provider, repositoryId, Number(pullRequestId), suiteIds, name),
    onSuccess: () => client.invalidateQueries({ queryKey: ["test-definitions"] }),
  });

  return (
    <Page
      title="テスト定義"
      description="アプリ内でテスト手順を作成・編集するか、プルリクエストに含まれる Markdown のテスト定義を取り込めます。定義を選び、実施項目と環境情報を指定してテストを開始してください。"
    >
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
        <h2>新しい定義を作成</h2>
        <p>定義名を入力して作成し、あとからスイートやテスト項目を追加できます。</p>
        <input aria-label="定義名" value={name} onChange={(event) => setName(event.target.value)} />
        <button type="button" onClick={() => create.mutate()} disabled={create.isPending}>
          定義を作成
        </button>
        <button
          type="button"
          onClick={() =>
            setDraftSuites((current) => [
              ...current,
              { id: `suite-${current.length + 1}`, title: "新しいスイート", items: [] },
            ])
          }
        >
          スイートを追加
        </button>
      </section>
      <section className="history">
        <h2>リポジトリから取り込む</h2>
        <p>プロバイダーとプルリクエストを選び、取り込むスイートにチェックを入れてください。</p>
        <select
          aria-label="取り込み元"
          value={provider}
          onChange={(event) => setProvider(event.target.value as typeof provider)}
        >
          <option value="azureRepos">Azure Repos</option>
          <option value="github">GitHub</option>
        </select>
        <input aria-label="リポジトリ" value={repositoryId} readOnly />
        <select
          aria-label="プルリクエスト"
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
          <legend>取り込むスイート</legend>
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
          選択したスイートを取り込む
        </button>
      </section>
      <section>
        <h2>保存済みのテスト定義</h2>
        <p>定義を選ぶと、内容の編集とテスト実行の準備ができます。</p>
        {definitions.data?.length ? (
          <ul className="cards">
            {definitions.data.map((entry) => (
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
        ) : (
          !definitions.isPending && (
            <p className="empty-state">
              定義はまだありません。上のフォームから作成するか、リポジトリから取り込んでください。
            </p>
          )
        )}
      </section>
      {selected.data && (
        <section className="history">
          <h2>「{selected.data.value.name}」を編集</h2>
          <p>スイート内の手順を整えて変更を保存します。テストの実施時は、対象項目を選択できます。</p>
          <input aria-label="定義名を編集" value={name} onChange={(event) => setName(event.target.value)} />
          {draftSuites.map((suite, suiteIndex) => (
            <fieldset key={suite.id}>
              <legend>{suite.title}</legend>
              <input
                aria-label={`スイート${suiteIndex + 1}の名前`}
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
                スイートを削除
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
                上へ移動
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
                下へ移動
              </button>
              {suite.items.map((item, itemIndex) => (
                <div key={item.id || `${suite.id}-${itemIndex}`}>
                  <input
                    aria-label={`スイート${suiteIndex + 1}の項目${itemIndex + 1}`}
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
                    上へ移動
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
                    下へ移動
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
                    項目を削除
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() =>
                  setDraftSuites((current) =>
                    current.map((entry, index) =>
                      index === suiteIndex
                        ? { ...entry, items: [...entry.items, { hierarchy: [], text: "新しいテスト項目" }] }
                        : entry,
                    ),
                  )
                }
              >
                テスト項目を追加
              </button>
            </fieldset>
          ))}
          <button
            type="button"
            onClick={() =>
              setDraftSuites((current) => [
                ...current,
                { id: `suite-${current.length + 1}`, title: "新しいスイート", items: [] },
              ])
            }
          >
            スイートを追加
          </button>
          <button type="button" onClick={() => update.mutate(selected.data)} disabled={update.isPending}>
            変更を保存
          </button>
          <fieldset>
            <legend>実施する項目を選択</legend>
            {selected.data.suites.map((suite) => {
              const suiteItems = selected.data.items.filter((item) => item.value.suiteId === suite.value.id);
              return (
                <div className="suite-selection" key={suite.value.id}>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={
                        suiteItems.length > 0 &&
                        suiteItems.every((item) =>
                          runItemIds.includes(testItemSelectionId(suite.value.id, item.value.id)),
                        )
                      }
                      onChange={(event) => {
                        const itemIds = suiteItems.map((item) => testItemSelectionId(suite.value.id, item.value.id));
                        setRunItemIds((current) =>
                          event.target.checked
                            ? [...new Set([...current, ...itemIds])]
                            : current.filter((id) => !itemIds.includes(id)),
                        );
                      }}
                    />
                    {suite.value.title}
                  </label>
                  {groupByChapter(suiteItems, (item) => item.value.hierarchy).map((group) => (
                    <div className="chapter" key={group.items[0]?.value.id || group.title}>
                      {group.title && (
                        <label className="check">
                          <input
                            type="checkbox"
                            checked={group.items.every((item) =>
                              runItemIds.includes(testItemSelectionId(suite.value.id, item.value.id)),
                            )}
                            onChange={(event) => {
                              const itemIds = group.items.map((item) =>
                                testItemSelectionId(suite.value.id, item.value.id),
                              );
                              setRunItemIds((current) =>
                                event.target.checked
                                  ? [...new Set([...current, ...itemIds])]
                                  : current.filter((id) => !itemIds.includes(id)),
                              );
                            }}
                          />
                          {group.title}
                        </label>
                      )}
                      {group.items.map((item) => (
                        <label className="check" key={item.value.id}>
                          <input
                            type="checkbox"
                            checked={runItemIds.includes(testItemSelectionId(suite.value.id, item.value.id))}
                            onChange={(event) =>
                              setRunItemIds((current) =>
                                event.target.checked
                                  ? [...new Set([...current, testItemSelectionId(suite.value.id, item.value.id)])]
                                  : current.filter((id) => id !== testItemSelectionId(suite.value.id, item.value.id)),
                              )
                            }
                          />
                          {item.value.hierarchy.slice(1).join(" / ")} {item.value.text}
                        </label>
                      ))}
                    </div>
                  ))}
                </div>
              );
            })}
          </fieldset>
          <RunMetadataFields
            details={runDetails}
            onChange={(key, value) => setRunDetails((current) => ({ ...current, [key]: value }))}
          />
          <button
            type="button"
            onClick={() => start.mutate(selected.data)}
            disabled={start.isPending || runItemIds.length === 0}
          >
            選択した項目でテストを開始
          </button>
        </section>
      )}
    </Page>
  );
}
