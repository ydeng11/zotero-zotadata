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
    "%s exposes the trimmed Sci-Hub settings dialog",
    (filePath) => {
      const markup = readProjectFile(filePath);

      expect(markup).not.toContain("chrome://zotadata/skin/zotadata.css");
      expect(markup).toContain("getZotero: function()");
      expect(markup).toContain("window.opener");
      expect(markup).toContain('id="scihub-enabled-checkbox"');
      expect(markup).toContain('type="checkbox"');
      expect(markup).toContain('id="save-button"');
      expect(markup).toContain('id="cancel-button"');
      expect(markup).toContain('caption label="PDF Sources"');
      expect(markup).toContain("saveAndClose: function()");
      expect(markup).toContain("cancel: function()");
      expect(markup).toContain('style="background-color: -moz-Dialog');
      expect(markup).toContain('class="zotadata-setting-row"');
      expect(markup).toContain("max-width: 32rem");
      expect(markup).toContain("box-sizing: border-box");
      expect(markup).toContain('orient="vertical"');
      expect(markup).not.toContain("<grid>");
      expect(markup).not.toContain("<checkbox");
      expect(markup).not.toContain('id="scihub-max-errors-menulist"');
      expect(markup).not.toContain('id="update-existing-checkbox"');
      expect(markup).not.toContain('id="auto-download-checkbox"');
      expect(markup).not.toContain('caption label="About"');
    },
  );
});
