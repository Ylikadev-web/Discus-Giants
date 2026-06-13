import { build } from "esbuild";
import { copyFile, mkdir, rm } from "node:fs/promises";

const rootFiles = ["index.html", "bundle.js", "bundle.css", "app-icon.svg", "manifest.webmanifest", "sw.js"];
const mirrorDirs = ["dist", "docs"];

await build({
  entryPoints: ["src/main.jsx"],
  bundle: true,
  outfile: "bundle.js",
  format: "esm",
  platform: "browser",
  target: "es2020",
  jsx: "automatic",
  logLevel: "info",
  minify: true,
});

for (const dir of mirrorDirs) {
  await rm(dir, { recursive: true, force: true });
  await mkdir(dir, { recursive: true });
  for (const file of rootFiles) {
    await copyFile(file, `${dir}/${file}`);
  }
}

await copyFile("bundle.js", "dist/bundle.js");
await copyFile("bundle.css", "dist/bundle.css");
await copyFile("bundle.js", "docs/bundle.js");
await copyFile("bundle.css", "docs/bundle.css");
