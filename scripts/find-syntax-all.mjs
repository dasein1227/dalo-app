import { readFileSync } from "fs";
import { globSync } from "glob";
import * as parser from "@babel/parser";

const files = globSync("{src,App.tsx}/**/*.{ts,tsx,js,jsx,json}", { nodir: true });
let count = 0;
for (const f of files) {
  const code = readFileSync(f, "utf8");
  try {
    if (f.endsWith(".json")) {
      JSON.parse(code);
    } else {
      parser.parse(code, {
        sourceType: "module",
        plugins: ["typescript", "jsx", "classProperties", "decorators-legacy", "dynamicImport"]
      });
    }
  } catch (e) {
    const line = e.loc?.line ?? 0, col = e.loc?.column ?? 0;
    console.log(`\n>>> Syntax error in ${f}:${line}:${col}`);
    console.log(String(e.message).slice(0, 200));
    const lines = code.split("\n");
    const from = Math.max(0, line - 2), to = Math.min(lines.length, line + 1);
    for (let i = from; i < to; i++) {
      const mark = i + 1 === line ? ">" : " ";
      console.log(`${mark} ${String(i + 1).padStart(4," ")} | ${lines[i]}`);
      if (i + 1 === line) console.log("    ^");
    }
    process.exit(1);
  }
  count++;
}
console.log(`OK: parsed ${count} files`);
