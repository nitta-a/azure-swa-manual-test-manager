import assert from "node:assert/strict";
import test from "node:test";
import { calculateRunResult, hasPendingItems } from "./result.js";

test("failed wins over blocked and skipped", () => {
  assert.equal(
    calculateRunResult(["passed", "blocked", "failed", "skipped"]),
    "failed",
  );
});

test("blocked wins when there are no failures", () => {
  assert.equal(calculateRunResult(["passed", "blocked", "skipped"]), "blocked");
});

test("skipped does not fail a run", () => {
  assert.equal(calculateRunResult(["passed", "skipped"]), "passed");
  assert.equal(hasPendingItems(["passed", "pending"]), true);
});
