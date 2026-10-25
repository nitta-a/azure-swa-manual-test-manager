import { expect, test } from "vitest";
import { groupByChapter } from "../../src/features/shared/chapters";
import { markdownLinks } from "../../src/features/shared/markdown-links";

test("groups actual ReleaseCheck chapters rather than the shared file title", () => {
  const items = [
    { hierarchy: ["ReleaseCheck", "テスト実行環境"], text: "Chrome" },
    { hierarchy: ["ReleaseCheck", "デッキ", "編集"], text: "Save" },
    { hierarchy: ["ReleaseCheck", "デッキ", "表示"], text: "Open" },
    { hierarchy: ["ReleaseCheck", "翻訳機能"], text: "Translate" },
  ];
  expect(groupByChapter(items, (item) => item.hierarchy).map((group) => [group.title, group.items.length])).toEqual([
    ["テスト実行環境", 1],
    ["デッキ", 2],
    ["翻訳機能", 1],
  ]);
});

test("resolves described links, repository-root links, and fragments at the fixed GitHub commit", () => {
  const links = markdownLinks(
    [
      '[Setup](../setup.md#environment "description")',
      "[Deck](/docs/deck.md)",
      "[Section](#translation)",
      "[External](https://example.test/a_(b))",
      "[Unsafe](javascript:alert(1))",
    ].join("\n"),
    "https://github.com/owner/repo/blob/commit-1/checks/ReleaseCheck.md",
  );
  expect(links).toEqual([
    { title: "Setup", url: "https://github.com/owner/repo/blob/commit-1/setup.md#environment" },
    { title: "Deck", url: "https://github.com/owner/repo/blob/commit-1/docs/deck.md" },
    { title: "Section", url: "https://github.com/owner/repo/blob/commit-1/checks/ReleaseCheck.md#translation" },
    { title: "External", url: "https://example.test/a_(b)" },
  ]);
});

test("resolves Azure Repos paths and headings without losing the commit query", () => {
  const [link] = markdownLinks(
    '[Deck](../deck.md#view "deck instructions")',
    "https://dev.azure.com/org/project/_git/repo?path=%2Fchecks%2FReleaseCheck.md&version=GCcommit-1&_a=preview",
  );
  const resolved = new URL(link?.url || "");
  expect(resolved.searchParams.get("path")).toBe("/deck.md");
  expect(resolved.searchParams.get("version")).toBe("GCcommit-1");
  expect(resolved.hash).toBe("#view");
});
