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
  const file = resolve("unicode-data.tsv");

  return {
    name: "inline-unicode-data",
    transformIndexHtml(html) {
      const tsv = readFileSync(file, "utf8");
      const tag =
        `    <script type="text/tab-separated-values"`
        + ` id="unicode-data">\n`
        + tsv
        + `\n    </script>`;
      return html.replace(
        "</body>",
        tag + "\n  </body>",
      );
    },
  };
}
