// Generates noto-fonts.css — a single CSS file with @font-face rules
// for every Noto font available on Google Fonts, all unified under
// font-family: "Noto All". Browsers use unicode-range to download
// only the .woff2 slices needed for characters on the page.
//
// To rebuild:
//   npm run fonts

const UNIFIED_FAMILY = "Noto All";

// Chrome user agent to get woff2 + unicode-range from Google Fonts API.
// Safari UA returns woff (not woff2) for many fonts.
const USER_AGENT =
  "Mozilla/5.0 (X11; Linux x86_64) "
  + "AppleWebKit/537.36 (KHTML, like Gecko) "
  + "Chrome/120.0.0.0 Safari/537.36";

// Every Noto font available on Google Fonts that adds Unicode coverage.
// Sans preferred; Serif used when Sans isn't available.
const NOTO_FONTS = [
  // Core
  "Noto Sans",
  "Noto Sans Symbols",
  "Noto Sans Symbols 2",
  "Noto Sans Math",
  "Noto Music",
  "Noto Emoji",

  // Major living scripts
  "Noto Sans Arabic",
  "Noto Sans Armenian",
  "Noto Sans Bengali",
  "Noto Sans Cherokee",
  "Noto Sans Devanagari",
  "Noto Sans Ethiopic",
  "Noto Sans Georgian",
  "Noto Sans Gujarati",
  "Noto Sans Gurmukhi",
  "Noto Sans Hebrew",
  "Noto Sans Kannada",
  "Noto Sans Khmer",
  "Noto Sans Lao",
  "Noto Sans Malayalam",
  "Noto Sans Myanmar",
  "Noto Sans Oriya",
  "Noto Sans Sinhala",
  "Noto Sans Tamil",
  "Noto Sans Telugu",
  "Noto Sans Thai",
  "Noto Sans Mongolian",

  // CJK (one locale is sufficient — covers CJK
  // Compatibility Ideographs, Radicals, etc.)
  "Noto Sans SC",

  // Southeast Asian
  "Noto Sans Balinese",
  "Noto Sans Batak",
  "Noto Sans Buginese",
  "Noto Sans Buhid",
  "Noto Sans Cham",
  "Noto Sans Hanunoo",
  "Noto Sans Javanese",
  "Noto Sans Kayah Li",
  "Noto Sans Khojki",
  "Noto Sans Lisu",
  "Noto Sans New Tai Lue",
  "Noto Sans Rejang",
  "Noto Sans Sundanese",
  "Noto Sans Tagalog",
  "Noto Sans Tagbanwa",
  "Noto Sans Tai Le",
  "Noto Sans Tai Tham",
  "Noto Sans Tai Viet",

  // South Asian
  "Noto Sans Chakma",
  "Noto Sans Lepcha",
  "Noto Sans Limbu",
  "Noto Sans Meetei Mayek",
  "Noto Sans Newa",
  "Noto Sans Ol Chiki",
  "Noto Sans Saurashtra",
  "Noto Sans Syloti Nagri",
  "Noto Sans Thaana",
  "Noto Sans Tirhuta",
  "Noto Sans Wancho",
  "Noto Sans Warang Citi",

  // South Asian (historical/extended)
  "Noto Sans Bhaiksuki",
  "Noto Sans Brahmi",
  "Noto Sans Grantha",
  "Noto Sans Kaithi",
  "Noto Sans Khudawadi",
  "Noto Sans Mahajani",
  "Noto Sans Modi",
  "Noto Sans Multani",
  "Noto Sans Nandinagari",
  "Noto Sans Phags Pa",
  "Noto Sans Sharada",
  "Noto Sans Siddham",
  "Noto Sans Sora Sompeng",
  "Noto Sans Takri",
  "Noto Sans Kharoshthi",
  "Noto Sans Masaram Gondi",
  "Noto Sans Gunjala Gondi",
  "Noto Sans Pau Cin Hau",
  "Noto Sans Zanabazar Square",
  "Noto Sans Soyombo",
  "Noto Sans Marchen",

  // African
  "Noto Sans Adlam",
  "Noto Sans Bamum",
  "Noto Sans Bassa Vah",
  "Noto Sans Coptic",
  "Noto Sans Medefaidrin",
  "Noto Sans Mende Kikakui",
  "Noto Sans NKo",
  "Noto Sans Nushu",
  "Noto Sans Osmanya",
  "Noto Sans Tifinagh",
  "Noto Sans Vai",
  "Noto Sans Miao",
  "Noto Sans Mro",

  // Middle Eastern / Central Asian
  "Noto Sans Avestan",
  "Noto Sans Imperial Aramaic",
  "Noto Sans Inscriptional Pahlavi",
  "Noto Sans Inscriptional Parthian",
  "Noto Sans Mandaic",
  "Noto Sans Manichaean",
  "Noto Sans Nabataean",
  "Noto Sans Old North Arabian",
  "Noto Sans Old South Arabian",
  "Noto Sans Old Persian",
  "Noto Sans Old Turkic",
  "Noto Sans Palmyrene",
  "Noto Sans Phoenician",
  "Noto Sans Psalter Pahlavi",
  "Noto Sans Samaritan",
  "Noto Sans Sogdian",
  "Noto Sans Old Sogdian",
  "Noto Sans Syriac",
  "Noto Sans Hanifi Rohingya",
  "Noto Sans Chorasmian",
  "Noto Sans Elymaic",
  "Noto Sans Hatran",
  "Noto Sans Pahawh Hmong",
  "Noto Sans Tangsa",
  "Noto Sans Kawi",
  "Noto Sans Sunuwar",
  "Noto Sans Nag Mundari",

  // European (historical)
  "Noto Sans Caucasian Albanian",
  "Noto Sans Elbasan",
  "Noto Sans Glagolitic",
  "Noto Sans Gothic",
  "Noto Sans Ogham",
  "Noto Sans Old Italic",
  "Noto Sans Old Permic",
  "Noto Sans Runic",
  "Noto Sans Shavian",
  "Noto Sans Deseret",
  "Noto Sans Osage",
  "Noto Sans Vithkuqi",

  // Ancient
  "Noto Sans Anatolian Hieroglyphs",
  "Noto Sans Carian",
  "Noto Sans Cuneiform",
  "Noto Sans Cypriot",
  "Noto Sans Cypro Minoan",
  "Noto Sans Duployan",
  "Noto Sans Egyptian Hieroglyphs",
  "Noto Sans Linear A",
  "Noto Sans Linear B",
  "Noto Sans Lycian",
  "Noto Sans Lydian",
  "Noto Sans Meroitic",
  "Noto Sans Old Hungarian",
  "Noto Sans SignWriting",
  "Noto Sans Ugaritic",
  "Noto Sans Indic Siyaq Numbers",
  "Noto Sans Mayan Numerals",

  // Canadian
  "Noto Sans Canadian Aboriginal",

  // Yi
  "Noto Sans Yi",

  // Serif fallbacks (for scripts without Sans
  // on Google Fonts)
  "Noto Serif Tibetan",
  "Noto Serif Dogra",
  "Noto Serif Ahom",
  "Noto Serif Yezidi",
  "Noto Serif Toto",
  "Noto Serif Tangut",
  "Noto Serif Makasar",
  "Noto Serif Dives Akuru",
  "Noto Serif Khitan Small Script",
  "Noto Serif Old Uyghur",
  "Noto Serif Nyiakeng Puachue Hmong",
  "Noto Serif Todhri",
  "Noto Serif Grantha",
  "Noto Serif Balinese",
];

async function fetchFontCSS(fontName) {
  const family = fontName.replace(/ /g, "+");
  const url =
    "https://fonts.googleapis.com/css2"
    + `?family=${family}&display=swap`;

  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });

  if (!res.ok) {
    console.error(
      `✗ ${fontName} (HTTP ${res.status})`,
    );
    return null;
  }

  const css = await res.text();
  console.error(`✓ ${fontName}`);
  return { fontName, css };
}

function rewriteFontFamily(css) {
  return css.replace(
    /font-family:\s*'[^']+'/g,
    `font-family: '${UNIFIED_FAMILY}'`,
  );
}

async function main() {
  console.error(
    `Fetching CSS for ${NOTO_FONTS.length} fonts…\n`,
  );

  // Fetch in batches of 10 to avoid overwhelming
  // the API
  const results = [];
  const BATCH = 10;
  for (let i = 0; i < NOTO_FONTS.length; i += BATCH) {
    const batch = NOTO_FONTS.slice(i, i + BATCH);
    const batchResults =
      await Promise.all(batch.map(fetchFontCSS));
    results.push(...batchResults);
  }

  const successful =
    results.filter((r) => r !== null);
  const failed =
    results.filter((r) => r === null).length;

  // Build the combined CSS
  const header =
    `/* Generated by build-fonts.js — do not edit */\n`
    + `/* ${successful.length} Noto fonts, `
    + `unified as font-family: "${UNIFIED_FAMILY}" */\n`
    + `/* Browsers download only the .woff2 slices `
    + `needed via unicode-range */\n`;

  const sections = successful.map(({ fontName, css }) => {
    const rewritten = rewriteFontFamily(css);
    return `\n/* --- ${fontName} --- */\n${rewritten}`;
  });

  const output = header + sections.join("\n");

  // Write to stdout so it can be piped, but also
  // write to file directly
  const { writeFileSync } = await import("node:fs");
  writeFileSync("noto-fonts.css", output);

  console.error(
    `\n${successful.length} fonts written`
    + ` to noto-fonts.css`
    + (failed ? ` (${failed} failed)` : ""),
  );
}

main();
