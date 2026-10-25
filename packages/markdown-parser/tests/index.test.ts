import { expect, test } from "vitest";
import { MarkdownParseError, parseTestMarkdown } from "../dist/index.js";

test("parses legacy nested list and heading markdown to the same shape", () => {
  const legacy = parseTestMarkdown("- TODO編集\n  - [ ] TODOのタイトルを編集できる\n  - [ ] TODOの期限を編集できる");
  const heading = parseTestMarkdown("## TODO編集\n- [ ] TODOのタイトルを編集できる\n- [ ] TODOの期限を編集できる");
  expect(legacy).toEqual(heading);
});

test("keeps heading hierarchy", () => {
  expect(parseTestMarkdown("## TODO編集\n### タイトル\n- [ ] 空文字に変更できる")).toEqual({
    items: [{ hierarchy: ["TODO編集", "タイトル"], text: "空文字に変更できる" }],
  });
});

test("keeps nested parent conditions under headings and preserves source item order", () => {
  expect(
    parseTestMarkdown(
      "## Checkout\n- Payment available\n  1. Card enabled\n     - [ ] card payment\n  2. [ ] cash payment\n- [ ] cancel order",
    ),
  ).toEqual({
    items: [
      { hierarchy: ["Checkout", "Payment available", "Card enabled"], text: "card payment" },
      { hierarchy: ["Checkout", "Payment available"], text: "cash payment" },
      { hierarchy: ["Checkout"], text: "cancel order" },
    ],
  });
});

test("ignores prose, links, and blockquotes", () => {
  expect(parseTestMarkdown("説明\n> - [ ] 引用ではない\n- [link](https://example.com)")).toEqual({ items: [] });
});

test("rejects malformed or empty checkbox items", () => {
  expect(() => parseTestMarkdown("- [x]")).toThrowError(MarkdownParseError);
  expect(() => parseTestMarkdown("- [/] bad")).toThrowError(MarkdownParseError);
});

test("accepts ReleaseCheck links with descriptions and ignores fenced example checkboxes", () => {
  expect(
    parseTestMarkdown(
      [
        "## ReleaseCheck",
        "### テスト実行環境",
        '- [手順](../setup.md#環境 "setup") を参照してください',
        "- [ ] Chromeで確認",
        "```markdown",
        "- [ ] example only",
        "```",
        "### デッキ",
        "- [ ] デッキを開く",
      ].join("\n"),
    ),
  ).toEqual({
    items: [
      { hierarchy: ["ReleaseCheck", "テスト実行環境"], text: "Chromeで確認" },
      { hierarchy: ["ReleaseCheck", "デッキ"], text: "デッキを開く" },
    ],
  });
});
