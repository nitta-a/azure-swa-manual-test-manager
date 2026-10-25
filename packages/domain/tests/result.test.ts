import { expect, test } from "vitest";
import { calculateRunProgress, calculateRunResult, hasPendingItems, testItemSelectionId } from "../dist/index.js";

test("failed wins over blocked and skipped", () => {
  expect(calculateRunResult(["passed", "blocked", "failed", "skipped"])).toBe("failed");
});

test("blocked wins when there are no failures", () => {
  expect(calculateRunResult(["passed", "blocked", "skipped"])).toBe("blocked");
});

test("skipped does not fail a run", () => {
  expect(calculateRunResult(["passed", "skipped"])).toBe("passed");
  expect(calculateRunResult(["skipped", "skipped"])).toBe("blocked");
  expect(hasPendingItems(["passed", "pending"])).toBe(true);
});

test("calculates every progress bucket", () => {
  expect(
    calculateRunProgress([
      { status: "pending" },
      { status: "passed" },
      { status: "failed" },
      { status: "blocked" },
      { status: "skipped" },
    ]),
  ).toEqual({ total: 5, pending: 1, passed: 1, failed: 1, blocked: 1, skipped: 1 });
});

test("creates unambiguous scoped selection IDs", () => {
  expect(testItemSelectionId("suite:one", "case")).not.toBe(testItemSelectionId("suite", "one:case"));
});
