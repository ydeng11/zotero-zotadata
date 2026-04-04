import { defineConfig } from 'zotero-plugin-scaffold';
import pkg from './package.json';

export default defineConfig({
  source: ['src', 'addon'],
  dist: '.scaffold/dist',
  name: pkg.config.addonName,
  id: pkg.config.addonID,
  namespace: pkg.config.addonRef,
  updateURL:
    'https://github.com/ydeng11/zotero-zotadata/releases/latest/download/update.json',
  xpiDownloadLink:
    'https://github.com/ydeng11/zotero-zotadata/releases/latest/download/zotadata.xpi',
  version: {
    min: '8.0',
    max: '8.*',
  },
  build: {
    assets: ['addon/**/*.*'],
    define: {
      ...pkg.config,
      author: pkg.author,
      description: pkg.description,
      homepage: (pkg as { homepage?: string }).homepage ?? '',
      buildVersion: pkg.version,
      buildTime: '{{buildTime}}',
    },
    prefs: {
      prefix: pkg.config.prefsPrefix,
    },
    esbuildOptions: [
      {
        entryPoints: ['src/index.ts'],
        define: {
          __env__: `"${process.env.NODE_ENV === 'production' ? 'production' : 'development'}"`,
        },
        bundle: true,
        target: 'firefox115',
        outfile: `.scaffold/dist/addon/content/scripts/${pkg.config.addonRef}.js`,
      },
    ],
    makeManifest: {
      enable: true,
      template: 'addon/chrome.manifest',
    },
    fluent: {
      enable: true,
    },
  },
  server: {
    devtools: true,
    asProxy: true,
    prebuild: true,
    startArgs: ['-jsconsole', '-ZoteroDebugText'],
  },
  test: {
    waitForPlugin: `() => Zotero.${pkg.config.addonInstance}.data.initialized`,
  },
  release: {
    bumpp: {
      release: true,
    },
  },
});
