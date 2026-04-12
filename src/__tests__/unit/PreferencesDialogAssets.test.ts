import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, test } from "vitest";

function readProjectFile(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

describe("preferences dialog assets", () => {
  test("packaged manifest does not need an external skin for preferences", () => {
    const distFiles = readProjectFile(".scaffold/dist/addon/chrome.manifest");

    expect(distFiles).toContain("content zotadata content/");
  });

  test.each(["content/options.xhtml", "addon/content/options.xhtml"])(
    "%s exposes the native-styled Sci-Hub settings controls",
    (filePath) => {
      const markup = readProjectFile(filePath);

      expect(markup).not.toContain("chrome://zotadata/skin/zotadata.css");
      expect(markup).toContain("getZotero: function()");
      expect(markup).toContain("window.opener");
      expect(markup).toContain('id="scihub-enabled-checkbox"');
      expect(markup).toContain('id="scihub-max-errors-menulist"');
      expect(markup).toContain('style="background-color: -moz-Dialog');
      expect(markup).toContain('caption label="PDF Sources"');
      expect(markup).toContain('class="zotadata-setting-row"');
      expect(markup).toContain("max-width: 32rem");
      expect(markup).toContain("box-sizing: border-box");
      expect(markup).toContain('orient="vertical"');
      expect(markup).not.toContain("<grid>");
    },
  );
});
