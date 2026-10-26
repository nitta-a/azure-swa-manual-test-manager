import { expect, test } from "vitest";
import { ManifestValidationError, parseManifest } from "../dist/index.js";

test("flattens manifest v2 applications into stable, app-scoped features", () => {
  expect(
    parseManifest(`version: 2
applications:
  - id: maker
    title: Maker
    features:
      - id: auth
        title: Authentication
        path: tests/maker/auth.md
  - id: viewer
    title: Viewer
    features:
      - id: auth
        title: Authentication
        path: tests/viewer/auth.md
`),
  ).toEqual({
    version: 2,
    suites: [
      {
        id: "maker:auth",
        title: "Authentication",
        path: "tests/maker/auth.md",
        applicationId: "maker",
        applicationTitle: "Maker",
        featureId: "auth",
        featureTitle: "Authentication",
      },
      {
        id: "viewer:auth",
        title: "Authentication",
        path: "tests/viewer/auth.md",
        applicationId: "viewer",
        applicationTitle: "Viewer",
        featureId: "auth",
        featureTitle: "Authentication",
      },
    ],
  });
});

for (const [name, source] of [
  [
    "duplicate application ids",
    "version: 2\napplications: [{id: a, title: A, features: []}, {id: a, title: B, features: []}]",
  ],
  ["unsupported version", "version: 1\nsuites: []"],
  ["empty feature title", 'version: 2\napplications: [{id: a, title: A, features: [{id: f, title: "", path: a.md}]}]'],
]) {
  test(`rejects ${name}`, () => expect(() => parseManifest(source)).toThrowError(ManifestValidationError));
}
