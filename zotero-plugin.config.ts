import { defineConfig } from "zotero-plugin-scaffold";
import pkg from "./package.json";

export default defineConfig({
  source: ["addon"],
  dist: ".scaffold/dist",
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  updateURL:
    "https://github.com/ydeng11/zotero-zotadata/releases/latest/download/update.json",
  xpiDownloadLink:
    "https://github.com/ydeng11/zotero-zotadata/releases/latest/download/zotadata.xpi",
  version: {
    min: "8.0",
    max: "8.*",
  },
  build: {
    esbuildOptions: [],
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