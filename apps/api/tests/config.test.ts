import { afterEach, expect, test } from "vitest";
import { createServiceFromEnvironment } from "../src/config.js";

const environmentKeys = [
  "AZURE_STORAGE_CONNECTION_STRING",
  "ADO_ORGANIZATION_URL",
  "ADO_PROJECT",
  "ADO_REPOSITORY_ID",
  "ADO_PAT",
  "MANIFEST_PATH",
] as const;

const originalEnvironment = new Map(
  environmentKeys.map((key) => [key, process.env[key]]),
);

afterEach(() => {
  for (const key of environmentKeys) {
    const value = originalEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("uses in-memory repositories when storage is not configured", async () => {
  for (const key of environmentKeys) delete process.env[key];

  const service = await createServiceFromEnvironment();

  await expect(service.get("missing-run")).rejects.toMatchObject({
    status: 404,
    message: "test run not found",
  });
  expect(() => service.listPullRequests()).toThrow(
    "Azure DevOps is not configured",
  );
});
