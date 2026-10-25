#!/usr/bin/env sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$repo_root"

if [ -z "${AZURE_STORAGE_CONNECTION_STRING:-}" ]; then
  settings_file=apps/api/local.settings.json
  if [ ! -f "$settings_file" ]; then
    echo "Set AZURE_STORAGE_CONNECTION_STRING or create $settings_file from local.settings.example.json." >&2
    exit 1
  fi
  AZURE_STORAGE_CONNECTION_STRING=$(node -e 'console.log(JSON.parse(require("node:fs").readFileSync(process.argv[1], "utf8")).Values.AZURE_STORAGE_CONNECTION_STRING ?? "")' "$settings_file")
fi

if [ -z "$AZURE_STORAGE_CONNECTION_STRING" ]; then
  echo "AZURE_STORAGE_CONNECTION_STRING is empty." >&2
  exit 1
fi

if [ "$AZURE_STORAGE_CONNECTION_STRING" = "UseDevelopmentStorage=true" ]; then
  AZURE_STORAGE_CONNECTION_STRING='DefaultEndpointsProtocol=http;AccountName=devstoreaccount1;AccountKey=Eby8vdM02xNOcqFlqUwJPLlmEtlCDXJ1OUzFT50uSRZ6IFsuFq2UVErCz4I6tq/K1SZFPTOtr/KBHBeksoGMGw==;BlobEndpoint=http://127.0.0.1:10000/devstoreaccount1;QueueEndpoint=http://127.0.0.1:10001/devstoreaccount1;TableEndpoint=http://127.0.0.1:10002/devstoreaccount1;'
fi

for table in TestRuns TestRunSummaries TestRunSuites TestRunItems TestExecutions TestDefinitions TestDefinitionRevisions TestDefinitionSuites TestDefinitionItems; do
  az storage table create --name "$table" --connection-string "$AZURE_STORAGE_CONNECTION_STRING" --output none
done
