import { describe, it, expect, vi } from "vitest";
import { ZotadataPlugin } from "@/plugin";
import { LIBRARY_ITEM_MENU_LABELS } from "@/constants/Menus";

type MenuRegisterCall = {
  menuID: string;
  pluginID: string;
  target: string;
  menus: Array<{
    menuType: string;
    l10nID?: string;
    onShowing?: unknown;
    menus?: Array<{ menuType: string; l10nID?: string; onShowing?: unknown }>;
  }>;
};

function getMenuRegisterCalls(): MenuRegisterCall[] {
  return (
    (globalThis as { __menuManagerRegisterCalls?: MenuRegisterCall[] })
      .__menuManagerRegisterCalls ?? []
  );
}

function getMenuUnregisterCalls(): string[] {
  return (
    (globalThis as { __menuManagerUnregisterCalls?: string[] })
      .__menuManagerUnregisterCalls ?? []
  );
}

describe("MenuRegistration (Zotero 8 MenuManager)", () => {
  it("calls registerMenu with menuID, pluginID, target, and menu items with onShowing labels", async () => {
    const plugin = new ZotadataPlugin();
    await plugin.init({
      id: "zotadata@zotero.org",
      version: "1.0.0",
      rootURI: "",
    });

    const calls = getMenuRegisterCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].menuID).toBe("zotadata-main-library-item-actions");
    expect(calls[0].pluginID).toBe("zotadata@zotero.org");
    expect(calls[0].target).toBe("main/library/item");
    expect(calls[0].menus).toHaveLength(1);
    const root = calls[0].menus[0];
    expect(root.menuType).toBe("submenu");
    expect(root.l10nID).toBe("zotadata-submenu");
    expect(typeof root.onShowing).toBe("function");
    expect(root.menus).toBeDefined();
    const actions = root.menus ?? [];
    expect(actions).toHaveLength(6);
    expect(actions.slice(0, 4).every((m) => m.menuType === "menuitem")).toBe(
      true,
    );
    expect(
      actions.slice(0, 4).every((m) => typeof m.onShowing === "function"),
    ).toBe(true);
    expect(actions.slice(0, 4).map((m) => m.l10nID)).toEqual([
      "zotadata-menu-check-attachments",
      "zotadata-menu-fetch-metadata",
      "zotadata-menu-process-arxiv",
      "zotadata-menu-find-files",
    ]);
    expect(actions[4].menuType).toBe("separator");
    expect(actions[5].menuType).toBe("menuitem");
    expect(actions[5].l10nID).toBe("zotadata-menu-settings");
    expect(LIBRARY_ITEM_MENU_LABELS).toEqual([
      "Validate References",
      "Update Metadata",
      "Process Preprints",
      "Retrieve Files",
    ]);
  });

  it("shutdown does not call unregisterMenu (Zotero clears plugin menus on addon shutdown)", async () => {
    const plugin = new ZotadataPlugin();
    await plugin.init({
      id: "zotadata@zotero.org",
      version: "1.0.0",
      rootURI: "",
    });
    await plugin.shutdown();

    expect(getMenuUnregisterCalls()).toEqual([]);
  });

  it("completes init when registerMenu returns false", async () => {
    const spy = vi
      .spyOn(Zotero.MenuManager, "registerMenu")
      .mockReturnValue(false);

    const plugin = new ZotadataPlugin();
    await expect(
      plugin.init({
        id: "zotadata@zotero.org",
        version: "1.0.0",
        rootURI: "",
      }),
    ).resolves.toBeUndefined();

    spy.mockRestore();
  });

  it("does not register the same MenuManager menu twice on main window ready", async () => {
    const plugin = new ZotadataPlugin();

    await plugin.init({
      id: "zotadata@zotero.org",
      version: "1.0.0",
      rootURI: "",
    });

    const win = { ZoteroPane: {} } as unknown as Window;

    await plugin.onMainWindowReady(win);

    const calls = getMenuRegisterCalls();
    expect(calls).toHaveLength(1);
    expect(calls[0].menuID).toBe("zotadata-main-library-item-actions");
  });
});
