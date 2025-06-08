import { defineConfig } from "zotero-plugin-scaffold";
import pkg from "./package.json";

export default defineConfig({
  source: ["src", "addon"],
  dist: ".scaffold/dist",
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  updateURL: 
    "https://github.com/yourusername/zotero-attachment-finder/releases/latest/download/update.json",
  xpiDownloadLink:
    "https://github.com/yourusername/zotero-attachment-finder/releases/latest/download/zotero-attachment-finder.xpi",
  build: {
    esbuildOptions: [
      {
        entryPoints: ["src/index.ts"],
        define: {
          __env__: `"${process.env.NODE_ENV || "development"}"`,
        },
        bundle: true,
        target: "firefox115",
        outfile: `.scaffold/dist/addon/chrome/content/scripts/${pkg.config.addonRef}.js`,
      },
    ],
    makeManifest: {
      enable: true,
      template: "addon/chrome.manifest",
    },
    fluent: {
      enable: false,
    },
  },
  release: {
    bumpp: {
      release: true,
    },
  },
}); 