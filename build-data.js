// UnicodeData.txt is the canonical source for character data.
// Blocks.txt defines Unicode block ranges.
// Source: https://www.unicode.org/Public/UCD/latest/ucd/
//
// To check for updates:
//   curl -O https://www.unicode.org/Public/UCD/latest/ucd/UnicodeData.txt
//   curl -O https://www.unicode.org/Public/UCD/latest/ucd/Blocks.txt
//   diff UnicodeData.txt <(git show HEAD:UnicodeData.txt)
//   diff Blocks.txt <(git show HEAD:Blocks.txt)
//
// To rebuild after updating:
//   npm run data

import { readFileSync, writeFileSync } from "node:fs";

const SKIP_CATEGORIES = new Set([
  "Cc", // control
  "Cs", // surrogate
  "Co", // private use
]);

// Parse blocks
const blocks = [];
for (const line of readFileSync("Blocks.txt", "utf8").split("\n")) {
  if (line.startsWith("#") || !line.trim()) continue;
  const match = line.match(
    /^([0-9A-F]+)\.\.([0-9A-F]+);\s*(.+)$/,
  );
  if (!match) continue;
  blocks.push({
    start: parseInt(match[1], 16),
    end: parseInt(match[2], 16),
    name: match[3].trim(),
  });
}

// Parse characters and assign block indices
const entries = [];
const blockIndices = new Map();

const source = readFileSync("UnicodeData.txt", "utf8");
for (const line of source.trim().split("\n")) {
  const fields = line.split(";");
  const codepoint = parseInt(fields[0], 16);
  const name = fields[1];
  const category = fields[2];

  if (SKIP_CATEGORIES.has(category)) continue;
  if (name.startsWith("<")) continue;

  const block = blocks.find(
    (b) => codepoint >= b.start && codepoint <= b.end,
  );
  if (block && !blockIndices.has(block.name)) {
    blockIndices.set(block.name, entries.length);
  }

  const char = String.fromCodePoint(codepoint);
  entries.push(char + "\t" + name);
}

writeFileSync(
  "unicode-data.tsv",
  entries.join("\n") + "\n",
);

const blockLines = [];
for (const [name, index] of blockIndices) {
  blockLines.push(index + "\t" + name);
}
writeFileSync(
  "unicode-blocks.tsv",
  blockLines.join("\n") + "\n",
);

console.log(
  `${entries.length.toLocaleString()} characters,`
  + ` ${blockIndices.size} blocks`,
);
