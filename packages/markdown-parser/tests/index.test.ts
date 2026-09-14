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

test("ignores prose, links, and blockquotes", () => {
  expect(parseTestMarkdown("説明\n> - [ ] 引用ではない\n- [link](https://example.com)")).toEqual({ items: [] });
});

test("rejects malformed or empty checkbox items", () => {
  expect(() => parseTestMarkdown("- [x]")).toThrowError(MarkdownParseError);
  expect(() => parseTestMarkdown("- [/] bad")).toThrowError(MarkdownParseError);
});
