export interface ParsedTestItem {
  hierarchy: string[];
  text: string;
}

export interface ParsedTestDefinition {
  items: ParsedTestItem[];
}

export class MarkdownParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarkdownParseError";
  }
}

interface HeadingEntry {
  level: number;
  text: string;
}
interface ListEntry {
  indent: number;
  text: string;
}

export function parseTestMarkdown(markdown: string): ParsedTestDefinition {
  const headings: HeadingEntry[] = [];
  const listHeadings: ListEntry[] = [];
  const items: ParsedTestItem[] = [];

  for (const [index, line] of markdown.replace(/\r\n?/g, "\n").split("\n").entries()) {
    const lineNumber = index + 1;
    const heading = /^(#{2,6})\s+(.+?)\s*#*\s*$/.exec(line);
    if (heading) {
      const text = heading[2]?.trim();
      if (!text) throw new MarkdownParseError(`empty heading at line ${lineNumber}`);
      const level = heading[1]?.length ?? 2;
      while (headings.at(-1) && (headings.at(-1)?.level ?? 0) >= level) headings.pop();
      headings.push({ level, text });
      continue;
    }

    const bullet = /^(\s*)[-*+]\s+(.*)$/.exec(line);
    if (!bullet) continue;
    const indent = bullet[1]?.replace(/\t/g, "    ").length ?? 0;
    const body = bullet[2] ?? "";
    if (/^\[[^\]]+\]\([^)]*\)$/.test(body.trim())) continue;
    const checkbox = /^\[([^\]]*)\]\s*(.*)$/.exec(body);
    if (checkbox) {
      const marker = checkbox[1] ?? "";
      const text = checkbox[2]?.trim() ?? "";
      if (!/^[ xX]$/.test(marker) || !text) throw new MarkdownParseError(`invalid checkbox item at line ${lineNumber}`);
      const hierarchy =
        headings.length > 0 ? headings.map((entry) => entry.text) : listHeadings.map((entry) => entry.text);
      items.push({ hierarchy, text });
      continue;
    }

    // Plain list entries are hierarchy labels only; links and paragraphs are never items.
    if (body.trim()) {
      while (listHeadings.at(-1) && (listHeadings.at(-1)?.indent ?? 0) >= indent) listHeadings.pop();
      listHeadings.push({ indent, text: body.trim() });
    }
  }
  return { items };
}
