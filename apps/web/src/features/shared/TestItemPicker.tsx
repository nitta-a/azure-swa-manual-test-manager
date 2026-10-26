import { useMemo, useState } from "react";
import { groupByChapter } from "./chapters";

export interface PickableTestItem {
  id: string;
  hierarchy: string[];
  text: string;
}

export interface PickableFeature {
  id: string;
  title: string;
  applicationId?: string | undefined;
  applicationTitle?: string | undefined;
  items: PickableTestItem[];
}

interface ApplicationGroup {
  id: string;
  title: string;
  features: PickableFeature[];
}

interface TestItemPickerProps {
  features: PickableFeature[];
  selectedItemIds: string[];
  onChange: (selectedItemIds: string[]) => void;
  onReview?: (selectedItemIds: string[]) => void;
}

const displayLimit = 100;
const unclassifiedApplicationId = "unclassified";

function applicationKey(id?: string) {
  return id ? `app:${id}` : unclassifiedApplicationId;
}

export function TestItemPicker({ features, selectedItemIds, onChange, onReview }: TestItemPickerProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [activeApplications, setActiveApplications] = useState<string[]>();
  const [query, setQuery] = useState("");
  const [crossApplicationSearch, setCrossApplicationSearch] = useState(true);
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [expandedFeatures, setExpandedFeatures] = useState<string[]>([]);
  const selected = useMemo(() => new Set(selectedItemIds), [selectedItemIds]);
  const applications = useMemo(() => {
    const groups = new Map<string, ApplicationGroup>();
    for (const feature of features) {
      const id = applicationKey(feature.applicationId);
      let application = groups.get(id);
      if (!application) {
        application = {
          id,
          title: feature.applicationTitle || "未分類のアプリ",
          features: [],
        };
        groups.set(id, application);
      }
      application.features.push(feature);
    }
    return [...groups.values()];
  }, [features]);
  const activeIds = activeApplications ?? applications.map((app) => app.id);
  const activeFeatures = features.filter((feature) => activeIds.includes(applicationKey(feature.applicationId)));
  const matchingItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return (crossApplicationSearch ? features : activeFeatures).flatMap((feature) => {
      const applicationTitle = feature.applicationTitle || "未分類のアプリ";
      const matching = feature.items.filter((item) => {
        const isSelected = selected.has(item.id);
        if (selectedOnly && !isSelected) return false;
        const text = [applicationTitle, feature.title, ...item.hierarchy, item.text].join(" ").toLocaleLowerCase();
        return !normalizedQuery || text.includes(normalizedQuery);
      });
      return matching.map((item) => ({ feature, item }));
    });
  }, [activeFeatures, crossApplicationSearch, features, query, selected, selectedOnly]);
  const selectedCount = selected.size;

  function toggleItems(ids: string[], checked: boolean) {
    const next = new Set(selected);
    for (const id of ids) {
      if (checked) next.add(id);
      else next.delete(id);
    }
    onChange([...next]);
    if (step === 3) onReview?.([...next]);
  }

  function toggleApplications(ids: string[], checked: boolean) {
    setActiveApplications((current) => {
      const base = current ?? applications.map((app) => app.id);
      const next = new Set(base);
      for (const id of ids) {
        if (checked) next.add(id);
        else next.delete(id);
      }
      return next.size === applications.length ? undefined : [...next];
    });
  }

  const selectedByApplication = applications.map((application) => ({
    application,
    count: application.features.reduce(
      (count, feature) => count + feature.items.filter((item) => selected.has(item.id)).length,
      0,
    ),
  }));

  return (
    <section className="test-item-picker" aria-label="テスト項目の選択">
      <header className="picker-summary" aria-live="polite">
        <strong>選択中: {selectedCount} 件</strong>
        <span>
          {applications.length} アプリ / {features.length} 機能 /{" "}
          {features.reduce((count, feature) => count + feature.items.length, 0)} 項目
        </span>
      </header>
      <nav className="picker-steps" aria-label="選択手順">
        {(["アプリを選ぶ", "機能・項目を選ぶ", "選択内容を確認"] as const).map((label, index) => {
          const number = (index + 1) as 1 | 2 | 3;
          return (
            <button
              className={`picker-step ${step === number ? "selected" : "quiet"}`}
              key={label}
              type="button"
              aria-current={step === number ? "step" : undefined}
              onClick={() => {
                setStep(number);
                if (number === 3) onReview?.(selectedItemIds);
              }}
            >
              {number}. {label}
            </button>
          );
        })}
      </nav>

      {step === 1 && (
        <div>
          <h3>対象アプリを絞り込む</h3>
          <p>ここで選ぶアプリは表示対象です。別のアプリに移動しても選択済み項目は保持されます。</p>
          <div className="application-cards">
            {applications.map((application) => {
              const count = application.features.reduce((total, feature) => total + feature.items.length, 0);
              const selectedInApplication =
                selectedByApplication.find((entry) => entry.application.id === application.id)?.count || 0;
              const active = activeIds.includes(application.id);
              return (
                <article className="application-card" key={application.id}>
                  <MixedCheckbox
                    checked={active}
                    indeterminate={false}
                    label={`${application.title}を表示`}
                    onChange={(checked) => toggleApplications([application.id], checked)}
                  />
                  <small>
                    {application.features.length} 機能 / {count} 項目 / 選択 {selectedInApplication}
                  </small>
                  <button
                    className="quiet"
                    type="button"
                    onClick={() =>
                      toggleItems(
                        application.features.flatMap((feature) => feature.items.map((item) => item.id)),
                        true,
                      )
                    }
                  >
                    このアプリの全項目を選択
                  </button>
                </article>
              );
            })}
          </div>
          <button type="button" onClick={() => setStep(2)}>
            機能選択へ ({activeFeatures.length} 機能)
          </button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h3>機能ごとに選択し、必要な項目を調整</h3>
          <div className="picker-tools">
            <label>
              テスト項目を検索
              <input
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="項目名・説明・章・機能・アプリを検索"
              />
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={crossApplicationSearch}
                onChange={(event) => setCrossApplicationSearch(event.target.checked)}
              />
              全アプリ横断で検索
            </label>
            <label className="check">
              <input
                type="checkbox"
                checked={selectedOnly}
                onChange={(event) => setSelectedOnly(event.target.checked)}
              />
              選択済み項目のみ表示
            </label>
          </div>
          {query.trim() || selectedOnly ? (
            <div>
              <p aria-live="polite">
                {matchingItems.length} 件が該当（{Math.min(displayLimit, matchingItems.length)} 件を表示）
              </p>
              <div className="picker-actions">
                <button
                  type="button"
                  disabled={!matchingItems.length}
                  onClick={() =>
                    toggleItems(
                      matchingItems.map(({ item }) => item.id),
                      true,
                    )
                  }
                >
                  該当 {matchingItems.length} 件をすべて選択
                </button>
                <button
                  className="quiet"
                  type="button"
                  disabled={!matchingItems.length}
                  onClick={() =>
                    toggleItems(
                      matchingItems.map(({ item }) => item.id),
                      false,
                    )
                  }
                >
                  該当 {matchingItems.length} 件をすべて解除
                </button>
              </div>
              <ul className="picker-item-results">
                {matchingItems.slice(0, displayLimit).map(({ feature, item }) => (
                  <li key={item.id}>
                    <ItemCheckbox
                      checked={selected.has(item.id)}
                      label={itemLabel(feature, item)}
                      onChange={(checked) => toggleItems([item.id], checked)}
                    />
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="picker-features">
              {activeFeatures.map((feature) => {
                const count = feature.items.length;
                const selectedCountInFeature = feature.items.filter((item) => selected.has(item.id)).length;
                const expanded = expandedFeatures.includes(feature.id);
                return (
                  <article className="picker-feature" key={feature.id}>
                    <div className="picker-feature-heading">
                      <MixedCheckbox
                        checked={selectedCountInFeature === count && count > 0}
                        indeterminate={selectedCountInFeature > 0 && selectedCountInFeature < count}
                        label={`${feature.title}を選択`}
                        onChange={(checked) =>
                          toggleItems(
                            feature.items.map((item) => item.id),
                            checked,
                          )
                        }
                      />
                      <span>
                        {selectedCountInFeature}/{count} 選択
                      </span>
                      <button
                        type="button"
                        className="quiet"
                        aria-expanded={expanded}
                        onClick={() =>
                          setExpandedFeatures((current) =>
                            expanded ? current.filter((id) => id !== feature.id) : [...current, feature.id],
                          )
                        }
                      >
                        {expanded ? "項目を閉じる" : "個別項目を調整"}
                      </button>
                    </div>
                    {expanded &&
                      groupByChapter(feature.items, (item) => item.hierarchy).map((chapter) => {
                        const chapterSelected = chapter.items.filter((item) => selected.has(item.id)).length;
                        return (
                          <div className="picker-chapter" key={chapter.items[0]?.id || chapter.title}>
                            {chapter.title && (
                              <MixedCheckbox
                                checked={chapterSelected === chapter.items.length}
                                indeterminate={chapterSelected > 0 && chapterSelected < chapter.items.length}
                                label={`${chapter.title}を選択`}
                                onChange={(checked) =>
                                  toggleItems(
                                    chapter.items.map((item) => item.id),
                                    checked,
                                  )
                                }
                              />
                            )}
                            <ul className="picker-item-results">
                              {chapter.items.map((item) => (
                                <li key={item.id}>
                                  <ItemCheckbox
                                    checked={selected.has(item.id)}
                                    label={itemLabel(feature, item)}
                                    onChange={(checked) => toggleItems([item.id], checked)}
                                  />
                                </li>
                              ))}
                            </ul>
                          </div>
                        );
                      })}
                  </article>
                );
              })}
            </div>
          )}
          <div className="picker-actions">
            <button className="quiet" type="button" onClick={() => setStep(1)}>
              アプリ選択へ戻る
            </button>
            <button
              type="button"
              onClick={() => {
                setStep(3);
                onReview?.(selectedItemIds);
              }}
            >
              選択内容を確認 ({selectedCount} 件)
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div>
          <h3>選択内容の確認</h3>
          {selectedCount === 0 ? (
            <p className="empty-state">テスト項目が選択されていません。</p>
          ) : (
            <div className="review-groups">
              {selectedByApplication
                .filter(({ count }) => count > 0)
                .map(({ application }) => (
                  <section className="review-application" key={application.id}>
                    <h4>{application.title}</h4>
                    {application.features
                      .map((feature) => ({
                        feature,
                        items: feature.items.filter((item) => selected.has(item.id)),
                      }))
                      .filter(({ items }) => items.length > 0)
                      .map(({ feature, items }) => (
                        <div className="review-feature" key={feature.id}>
                          <h5>
                            {feature.title} ({items.length})
                          </h5>
                          <button
                            className="quiet"
                            type="button"
                            onClick={() =>
                              toggleItems(
                                items.map((item) => item.id),
                                false,
                              )
                            }
                          >
                            この機能の選択を解除
                          </button>
                          <ul className="picker-item-results">
                            {items.map((item) => (
                              <li key={item.id}>
                                <ItemCheckbox
                                  checked
                                  label={itemLabel(feature, item)}
                                  onChange={() => toggleItems([item.id], false)}
                                />
                              </li>
                            ))}
                          </ul>
                        </div>
                      ))}
                  </section>
                ))}
            </div>
          )}
          <div className="picker-actions">
            <button className="quiet" type="button" onClick={() => setStep(2)}>
              項目選択へ戻る
            </button>
            <span>選択中: {selectedCount} 件</span>
          </div>
        </div>
      )}
    </section>
  );
}

function itemLabel(feature: PickableFeature, item: PickableTestItem) {
  const hierarchy = item.hierarchy.join(" / ");
  return `${feature.applicationTitle ? `${feature.applicationTitle} / ` : ""}${feature.title}${hierarchy ? ` / ${hierarchy}` : ""} / ${item.text}`;
}

function ItemCheckbox({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="check">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      {label}
    </label>
  );
}

function MixedCheckbox({
  checked,
  indeterminate,
  label,
  onChange,
}: {
  checked: boolean;
  indeterminate: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="check">
      <input
        type="checkbox"
        checked={checked}
        ref={(input) => {
          if (input) input.indeterminate = indeterminate;
        }}
        aria-label={label}
        onChange={(event) => onChange(event.target.checked)}
      />
      {label}
    </label>
  );
}
