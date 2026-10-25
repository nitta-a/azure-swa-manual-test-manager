import { afterEach, expect, test, vi } from "vitest";
import { createServiceFromEnvironment } from "../src/config.js";

const environmentKeys = [
  "AZURE_STORAGE_CONNECTION_STRING",
  "ADO_ORGANIZATION_URL",
  "ADO_PROJECT",
  "ADO_REPOSITORY_ID",
  "ADO_PAT",
  "MANIFEST_PATH",
] as const;

const originalEnvironment = new Map(environmentKeys.map((key) => [key, process.env[key]]));

afterEach(() => {
  vi.unstubAllEnvs();
  for (const key of environmentKeys) {
    const value = originalEnvironment.get(key);
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

test("refuses missing production storage instead of falling back to memory", async () => {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("AZURE_STORAGE_CONNECTION_STRING", "");
  await expect(createServiceFromEnvironment()).rejects.toThrow("AZURE_STORAGE_CONNECTION_STRING is required");
});

test("a hosted environment cannot enable the local memory fallback", async () => {
  vi.stubEnv("NODE_ENV", "development");
  vi.stubEnv("WEBSITE_HOSTNAME", "example.azurestaticapps.net");
  vi.stubEnv("AZURE_STORAGE_CONNECTION_STRING", "");
  await expect(createServiceFromEnvironment()).rejects.toThrow("in-memory storage is disabled");
});

test("uses in-memory repositories when storage is not configured", async () => {
  for (const key of environmentKeys) delete process.env[key];

  const service = await createServiceFromEnvironment();

  await expect(service.get("missing-run")).rejects.toMatchObject({
    status: 404,
    message: "test run not found",
  });
  await expect(service.listPullRequests()).rejects.toThrow("Azure DevOps is not configured");
  await expect(service.listPullRequests("github")).rejects.toMatchObject({
    status: 503,
    message: "github is not configured",
  });
});
