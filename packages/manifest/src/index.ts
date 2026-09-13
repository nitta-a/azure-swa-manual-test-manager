import { parse as parseYaml } from "yaml";

export interface ManifestSuite {
  id: string;
  title: string;
  path: string;
}

export interface ManifestV1 {
  version: 1;
  suites: ManifestSuite[];
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

export function parseManifest(source: string | unknown): ManifestV1 {
  let value: unknown;
  try {
    value = typeof source === "string" ? parseYaml(source) : source;
  } catch (error) {
    throw new ManifestValidationError(
      `invalid YAML: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
  if (!value || typeof value !== "object")
    throw new ManifestValidationError("manifest must be an object");
  const record = value as Record<string, unknown>;
  if (record.version !== 1)
    throw new ManifestValidationError("manifest version must be 1");
  if (!Array.isArray(record.suites))
    throw new ManifestValidationError("suites must be an array");

  const ids = new Set<string>();
  const suites = record.suites.map((entry, index) => {
    if (!entry || typeof entry !== "object")
      throw new ManifestValidationError(`suites[${index}] must be an object`);
    const suite = entry as Record<string, unknown>;
    const id = nonEmpty(suite.id, `suites[${index}].id`);
    if (ids.has(id))
      throw new ManifestValidationError(`duplicate suite id: ${id}`);
    ids.add(id);
    return {
      id,
      title: nonEmpty(suite.title, `suites[${index}].title`),
      path: nonEmpty(suite.path, `suites[${index}].path`),
    };
  });
  return { version: 1, suites };
}
