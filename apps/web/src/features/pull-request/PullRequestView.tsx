import { useState } from "react";
import { ErrorMessage } from "../shared/ErrorMessage";
import { Page } from "../shared/Page";
import { RunMetadataFields } from "../shared/RunMetadataFields";
import { TestItemPicker } from "../shared/TestItemPicker";
import { usePullRequest } from "./usePullRequest";

export function PullRequestView() {
  const { definition, selectedItemIds, setSelectedItems, startRun, details, setDetail } = usePullRequest();
  const [reviewedSignature, setReviewedSignature] = useState("");
  const signature = JSON.stringify([definition.data?.pullRequest.sourceCommitId, [...selectedItemIds].sort()]);
  const title = definition.data
    ? `#${definition.data.pullRequest.id} ${definition.data.pullRequest.title}`
    : "プルリクエストの詳細";

  return (
    <Page
      title={title}
      description="アプリ・機能から対象を絞り、テスト項目を検索・選択して内容を確認してから開始します。"
    >
      <ErrorMessage error={definition.error || startRun.error} />
      {definition.isPending ? (
        <p>読み込み中…</p>
      ) : (
        definition.data && (
          <>
            <p>
              変更コミット: <code>{definition.data.pullRequest.sourceCommitId}</code>
            </p>
            <TestItemPicker
              features={definition.data.suites.map((suite) => ({
                ...suite,
                title: suite.featureTitle || suite.title,
                items: suite.items,
              }))}
              selectedItemIds={selectedItemIds}
              onChange={(ids) => {
                setSelectedItems(ids);
                setReviewedSignature("");
              }}
              onReview={(ids) =>
                setReviewedSignature(JSON.stringify([definition.data?.pullRequest.sourceCommitId, [...ids].sort()]))
              }
            />
            <RunMetadataFields details={details} onChange={setDetail} />
            <button
              type="button"
              disabled={selectedItemIds.length === 0 || reviewedSignature !== signature || startRun.isPending}
              onClick={() => startRun.mutate()}
            >
              選択した {selectedItemIds.length} 項目でテストを開始
            </button>
          </>
        )
      )}
    </Page>
  );
}
