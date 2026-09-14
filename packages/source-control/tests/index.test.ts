import { expectTypeOf, test } from "vitest";
import type { PullRequestRef, SourceControlClient } from "../src/index.js";

test("exports the provider-neutral client contract", () => {
  expectTypeOf<PullRequestRef>().toHaveProperty("sourceCommitId");
  expectTypeOf<SourceControlClient>().toHaveProperty("getFile");
});
