export function markdownLinks(markdown: string, sourceUrl?: string): Array<{ title: string; url: string }> {
  const links = new Map<string, string>();
  for (const match of markdown.matchAll(
    /(?<!!)\[([^\]]+)\]\(\s*(<[^>]+>|[^\s()]*(?:\([^\s()]*\)[^\s()]*)*)(?:\s+["'][^"']*["'])?\s*\)/g,
  )) {
    const target = match[2]?.replace(/^<|>$/g, "");
    if (!target || target.startsWith("//") || (/^[a-z][a-z\d+.-]*:/i.test(target) && !/^https?:/i.test(target)))
      continue;
    if (!sourceUrl && !/^https?:/i.test(target)) continue;
    const base = sourceUrl ? new URL(sourceUrl) : undefined;
    let url: URL;
    if (base?.searchParams.has("path") && !/^[a-z][a-z\d+.-]*:/i.test(target)) {
      const resolved = new URL(target, `https://repository.invalid${base.searchParams.get("path")}`);
      base.searchParams.set("path", decodeURIComponent(resolved.pathname));
      base.hash = resolved.hash;
      url = base;
    } else if (base && /\/blob\/[^/]+\//.test(base.pathname) && !/^[a-z][a-z\d+.-]*:/i.test(target)) {
      const match = /^(.*\/blob\/[^/]+)(\/.*)$/.exec(base.pathname);
      const prefix = match?.[1];
      const path = match?.[2];
      if (!prefix || !path) continue;
      const resolved = new URL(target, `https://repository.invalid${path}`);
      base.pathname = `${prefix}${resolved.pathname}`;
      base.search = resolved.search;
      base.hash = resolved.hash;
      url = base;
    } else {
      if (!URL.canParse(target, base)) continue;
      url = new URL(target, base);
    }
    if (url.protocol === "https:" || url.protocol === "http:") links.set(url.href, match[1] || target);
  }
  return [...links].map(([url, title]) => ({ title, url }));
}
