import assert from "node:assert/strict";
import test from "node:test";
import { MarkdownParseError, parseTestMarkdown } from "./index.js";

test("parses legacy nested list and heading markdown to the same shape", () => {
  const legacy = parseTestMarkdown(
    "- TODO編集\n  - [ ] TODOのタイトルを編集できる\n  - [ ] TODOの期限を編集できる",
  );
  const heading = parseTestMarkdown(
    "## TODO編集\n- [ ] TODOのタイトルを編集できる\n- [ ] TODOの期限を編集できる",
  );
  assert.deepEqual(legacy, heading);
});

test("keeps heading hierarchy", () => {
  assert.deepEqual(
    parseTestMarkdown("## TODO編集\n### タイトル\n- [ ] 空文字に変更できる"),
    {
      items: [
        { hierarchy: ["TODO編集", "タイトル"], text: "空文字に変更できる" },
      ],
    },
  );
});

test("ignores prose, links, and blockquotes", () => {
  assert.deepEqual(
    parseTestMarkdown(
      "説明\n> - [ ] 引用ではない\n- [link](https://example.com)",
    ),
    { items: [] },
  );
});

test("rejects malformed or empty checkbox items", () => {
  assert.throws(() => parseTestMarkdown("- [x]"), MarkdownParseError);
  assert.throws(() => parseTestMarkdown("- [/] bad"), MarkdownParseError);
});
