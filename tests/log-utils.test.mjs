import assert from "node:assert/strict";
import test from "node:test";
import { filterLogEntries, filterLogLines, splitLogLines } from "../app/log-utils.js";

test("splits log text into lines", () => {
  assert.deepEqual(splitLogLines("a\r\nb\nc"), ["a", "b", "c"]);
});

test("filters log lines by substring", () => {
  const lines = [
    "2026-08-31 info server started",
    "2026-08-31 error timeout",
    "2026-08-31 info ready",
  ];

  assert.deepEqual(filterLogLines(lines, "error"), [
    "2026-08-31 error timeout",
  ]);
  assert.deepEqual(filterLogLines(lines, ""), lines);
});

test("preserves original line numbers when filtering", () => {
  const entries = filterLogEntries(
    ["one", "two error", "three", "four error"],
    "error",
  );
  assert.deepEqual(entries, [
    { number: 2, text: "two error" },
    { number: 4, text: "four error" },
  ]);
});
