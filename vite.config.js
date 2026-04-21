import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { defineConfig } from "vite";
import { viteSingleFile } from "vite-plugin-singlefile";

export default defineConfig({
  plugins: [
    inlineUnicodeData(),
    viteSingleFile({
      useRecommendedBuildConfig: false,
    }),
  ],
  build: {
    target: "esnext",
    cssTarget: "esnext",
    minify: false,
    modulePreload: false,
    rollupOptions: {
      output: {
        codeSplitting: false,
      },
    },
  },
});

function inlineUnicodeData() {
  const dataFile = resolve("data/unicode-data.tsv");
  const blocksFile = resolve("data/unicode-blocks.tsv");

  return {
    name: "inline-unicode-data",
    transformIndexHtml(html) {
      const data = readFileSync(dataFile, "utf8");
      const blocks = readFileSync(blocksFile, "utf8");
      const tags = [
        `    <script type="text/tab-separated-values"`
          + ` id="unicode-data">\n`
          + data
          + `\n    </script>`,
        `    <script type="text/tab-separated-values"`
          + ` id="unicode-blocks">\n`
          + blocks
          + `\n    </script>`,
      ].join("\n");
      return html.replace(
        "</body>",
        tags + "\n  </body>",
      );
    },
  };
}
