import type { RunDetails } from "../../api";

const fields: Array<[keyof RunDetails, string]> = [
  ["releaseName", "リリース名"],
  ["environmentUrl", "環境 URL"],
  ["makerVersion", "Maker 版"],
  ["viewerVersion", "Viewer 版"],
  ["functionsVersion", "Functions 版／コミット"],
  ["appVersionBefore", "変更前アプリ版"],
  ["appVersionAfter", "変更後アプリ版"],
  ["browser", "ブラウザ"],
  ["operatingSystem", "OS"],
  ["locale", "言語／ロケール"],
  ["featureConfiguration", "契約・機能設定"],
];

export function RunMetadataFields({
  details,
  onChange,
}: {
  details: RunDetails;
  onChange: (key: keyof RunDetails, value: string) => void;
}) {
  return (
    <fieldset>
      <legend>実施対象の情報（任意）</legend>
      {fields.map(([key, label]) => (
        <label key={key} htmlFor={`run-detail-${key}`}>
          {label}
          {key === "featureConfiguration" ? (
            <textarea
              id={`run-detail-${key}`}
              value={details[key] || ""}
              onChange={(event) => onChange(key, event.target.value)}
            />
          ) : (
            <input
              id={`run-detail-${key}`}
              type={key === "environmentUrl" ? "url" : "text"}
              value={details[key] || ""}
              onChange={(event) => onChange(key, event.target.value)}
            />
          )}
        </label>
      ))}
    </fieldset>
  );
}
