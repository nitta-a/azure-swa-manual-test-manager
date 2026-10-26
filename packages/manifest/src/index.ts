import { parse as parseYaml } from "yaml";

export interface ManifestSuite {
  id: string;
  title: string;
  path: string;
  applicationId?: string;
  applicationTitle?: string;
  featureId?: string;
  featureTitle?: string;
}

export interface ParsedManifest {
  version: 2;
  suites: ManifestSuite[];
}

export interface ManifestV2Feature {
  id: string;
  title: string;
  path: string;
}

export interface ManifestV2 {
  version: 2;
  applications: Array<{
    id: string;
    title: string;
    features: ManifestV2Feature[];
  }>;
}

export class ManifestValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManifestValidationError";
  }
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ManifestValidationError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new ManifestValidationError(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function parseV2(recordValue: Record<string, unknown>): ParsedManifest {
  if (!Array.isArray(recordValue.applications)) throw new ManifestValidationError("applications must be an array");
  const applicationIds = new Set<string>();
  const suiteIds = new Set<string>();
  const suites: ManifestSuite[] = [];
  recordValue.applications.forEach((entry, appIndex) => {
    const application = record(entry, `applications[${appIndex}]`);
    const applicationId = nonEmpty(application.id, `applications[${appIndex}].id`);
    if (applicationIds.has(applicationId))
      throw new ManifestValidationError(`duplicate application id: ${applicationId}`);
    applicationIds.add(applicationId);
    const applicationTitle = nonEmpty(application.title, `applications[${appIndex}].title`);
    if (!Array.isArray(application.features))
      throw new ManifestValidationError(`applications[${appIndex}].features must be an array`);
    application.features.forEach((entryFeature, featureIndex) => {
      const feature = record(entryFeature, `applications[${appIndex}].features[${featureIndex}]`);
      const featureId = nonEmpty(feature.id, `applications[${appIndex}].features[${featureIndex}].id`);
      const id = `${encodeURIComponent(applicationId)}:${encodeURIComponent(featureId)}`;
      if (suiteIds.has(id)) throw new ManifestValidationError(`duplicate feature id: ${applicationId}/${featureId}`);
      suiteIds.add(id);
      suites.push({
        id,
        title: nonEmpty(feature.title, `applications[${appIndex}].features[${featureIndex}].title`),
        path: nonEmpty(feature.path, `applications[${appIndex}].features[${featureIndex}].path`),
        applicationId,
        applicationTitle,
        featureId,
        featureTitle: nonEmpty(feature.title, `applications[${appIndex}].features[${featureIndex}].title`),
      });
    });
  });
  return { version: 2, suites };
}

export function parseManifest(source: string | unknown): ParsedManifest {
  let value: unknown;
  try {
    value = typeof source === "string" ? parseYaml(source) : source;
  } catch (error) {
    throw new ManifestValidationError(`invalid YAML: ${error instanceof Error ? error.message : "unknown error"}`);
  }
  const manifest = record(value, "manifest");
  if (manifest.version === 2) return parseV2(manifest);
  throw new ManifestValidationError("manifest version must be 2");
}
