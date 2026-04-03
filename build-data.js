// UnicodeData.txt is the canonical source for character data.
// Source: https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt
// Format: https://www.unicode.org/reports/tr44/#UnicodeData.txt
//
// To check for updates:
//   curl -O https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt
//   diff UnicodeData.txt <(git show HEAD:UnicodeData.txt)
//
// To rebuild after updating:
//   npm run data

import { readFileSync, writeFileSync } from "node:fs";

const source = readFileSync("UnicodeData.txt", "utf8");
const lines = source.trim().split("\n");

const SKIP_CATEGORIES = new Set([
  "Cc", // control
  "Cs", // surrogate
  "Co", // private use
]);

const entries = [];

for (const line of lines) {
  const fields = line.split(";");
  const codepoint = parseInt(fields[0], 16);
  const name = fields[1];
  const category = fields[2];

  if (SKIP_CATEGORIES.has(category)) continue;
  if (name.startsWith("<")) continue;

  const char = String.fromCodePoint(codepoint);
  entries.push(char + "\t" + name);
}

writeFileSync("unicode-data.tsv", entries.join("\n") + "\n");

console.log(`${entries.length.toLocaleString()} characters`);
