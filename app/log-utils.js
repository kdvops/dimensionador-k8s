export function splitLogLines(text) {
  if (typeof text !== "string" || text.length === 0) return [];
  return text.replace(/\r\n/g, "\n").split("\n");
}

export function filterLogLines(lines, filter) {
  const needle = typeof filter === "string" ? filter.trim().toLowerCase() : "";
  if (!needle) return lines;
  return lines.filter((line) => line.toLowerCase().includes(needle));
}

export function filterLogEntries(lines, filter) {
  const needle = typeof filter === "string" ? filter.trim().toLowerCase() : "";
  if (!needle) {
    return lines.map((text, index) => ({ number: index + 1, text }));
  }

  return lines.reduce((entries, text, index) => {
    if (text.toLowerCase().includes(needle)) {
      entries.push({ number: index + 1, text });
    }
    return entries;
  }, []);
}

export function formatLogLineCount(count) {
  return `${Math.max(0, count)} líneas`;
}
