export function groupByChapter<T>(items: T[], hierarchy: (item: T) => string[]) {
  let depth = 0;
  const first = items[0];
  while (
    first !== undefined &&
    items.every((item) => hierarchy(item).length > depth + 1 && hierarchy(item)[depth] === hierarchy(first)[depth])
  )
    depth++;
  const groups: Array<{ title: string; items: T[] }> = [];
  for (const item of items) {
    const title = hierarchy(item)[depth] || "";
    const last = groups.at(-1);
    if (last?.title === title) last.items.push(item);
    else groups.push({ title, items: [item] });
  }
  return groups;
}
