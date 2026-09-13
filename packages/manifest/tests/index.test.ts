import { expect, test } from "vitest";
import { ManifestValidationError, parseManifest } from "../dist/index.js";

test("parses manifest v1", () => {
  expect(
    parseManifest(
      "version: 1\nsuites:\n  - id: todo\n    title: TODO\n    path: tests/todo.md\n",
    ),
  ).toEqual({
    version: 1,
    suites: [{ id: "todo", title: "TODO", path: "tests/todo.md" }],
  });
});

for (const [name, source] of [
  [
    "duplicate ids",
    "version: 1\nsuites: [{id: a, title: A, path: a.md}, {id: a, title: B, path: b.md}]",
  ],
  ["unsupported version", "version: 2\nsuites: []"],
  ["empty title", 'version: 1\nsuites:\n  - id: a\n    title: ""\n    path: a.md'],
]) {
  test(`rejects ${name}`, () =>
    expect(() => parseManifest(source)).toThrowError(ManifestValidationError));
}
