import { ErrorManager, ErrorType } from "@/shared/core";
import { AttachmentChecker } from "@/modules/AttachmentChecker";
import { ArxivProcessor } from "@/modules/ArxivProcessor";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { FileFinder } from "@/modules/FileFinder";
import { CrossRefAPI } from "@/features/metadata/apis";
import { ZoteroUtils } from "@/shared/utils/ZoteroUtils";
import {
  LIBRARY_ITEM_MENU_LABELS,
  LIBRARY_ITEM_MENU_L10N_IDS,
  LIBRARY_ITEM_SUBMENU_L10N_ID,
  MenuParentID,
} from "@/constants/Menus";
import type {
  AddonData,
  MetadataResult,
  PluginConfig,
} from "@/shared/core/types";

/** Short titles for completion toasts (aligned with menu labels). */
const TOAST_OPERATION = {
  checkAttachments: "Check attachments",
  fetchMetadata: "Fetch metadata",
  processArxiv: "Process arXiv",
  findFiles: "Find missing files",
} as const;

/**
 * Main Zotadata plugin class (feature logic).
 */
export class ZotadataPlugin {
  private errorManager: ErrorManager;
  private attachmentChecker: AttachmentChecker;
  private crossRefAPI: CrossRefAPI;
  private config: PluginConfig;
  private addonData: AddonData | null = null;
  private addedElementIDs: string[] = [];
  private metadataFetcher: MetadataFetcher | null = null;
  private arxivProcessor: ArxivProcessor | null = null;
  private fileFinder: FileFinder | null = null;

  private static readonly TOAST_MAX_LINES = 14;

  constructor() {
    this.errorManager = new ErrorManager();
    this.attachmentChecker = new AttachmentChecker();
    this.crossRefAPI = new CrossRefAPI();

    this.config = {
      maxConcurrentDownloads: 3,
      maxFileSize: 100 * 1024 * 1024,
      downloadTimeout: 30000,
      enabledAPIs: ["CrossRef", "OpenAlex", "SemanticScholar"],
      rateLimits: {
        CrossRef: { requests: 50, window: 1000 },
        OpenAlex: { requests: 100, window: 1000 },
        SemanticScholar: { requests: 100, window: 1000 },
      },
      cacheSettings: { ttl: 3600000, maxSize: 1000 },
      userAgent: "Zotero Zotadata/1.0",
    };
  }

  async init(data: AddonData): Promise<void> {
    return this.errorManager.wrapAsync(
      async () => {
        this.log("Initializing Zotadata plugin...");
        this.addonData = data;

        await this.registerMenus();

        this.log("Zotadata plugin initialized successfully");
      },
      ErrorType.ZOTERO_ERROR,
      { operation: "init", addonId: data.id },
    );
  }

  async startup(): Promise<void> {
    this.log("Zotadata plugin started");
  }

  async shutdown(): Promise<void> {
    return this.errorManager.wrapAsync(
      async () => {
        this.log("Shutting down Zotadata plugin...");

        // Do not call MenuManager.unregisterMenu: Zotero removes plugin menu
        // registrations during addon shutdown; a second unregister logs
        // "Can't remove unknown option" and can run after cleanup.

        await this.removeFromAllWindows();

        this.log("Zotadata plugin shut down successfully");
      },
      ErrorType.ZOTERO_ERROR,
      { operation: "shutdown" },
    );
  }

  async uninstall(): Promise<void> {
    await this.shutdown();
    this.log("Zotadata plugin uninstalled");
  }

  /**
   * Called when a main Zotero window loads (legacy XUL menus only).
   */
  async onMainWindowReady(win: Window): Promise<void> {
    if (!ZoteroUtils.hasNewMenuAPI() && win.ZoteroPane) {
      await this.addToWindow(win);
    }
  }

  private async registerMenus(): Promise<void> {
    try {
      if (ZoteroUtils.hasNewMenuAPI()) {
        await this.registerMenusWithMenuAPI();
      } else {
        await this.registerMenusLegacy();
      }
    } catch (error) {
      this.log(`Failed to register menus: ${error}`);
    }
  }

  private async registerMenusWithMenuAPI(): Promise<void> {
    const pluginID = this.addonData?.id || "zotadata@zotero.org";
    const menuID = "zotadata-main-library-item-actions";

    const commands: Array<() => void | Promise<void>> = [
      () => this.handleCheckAttachments(),
      () => this.handleFetchMetadata(),
      () => this.handleProcessArxiv(),
      () => this.handleFindFiles(),
    ];

    const libraryItemContextShowing = (
      ctx: {
        menuElem?: Element;
        setEnabled?: (enabled: boolean) => void;
        items?: Zotero.Item[];
      },
      label: string,
    ): void => {
      ctx.menuElem?.setAttribute("label", label);
      const items = ctx.items;
      let enabled = true;
      if (Array.isArray(items)) {
        enabled =
          items.length > 0 && items.some((item) => item.isRegularItem());
      }
      ctx.setEnabled?.(enabled);
    };

    const actionMenus: Zotero.MenuManager.MenuData[] =
      LIBRARY_ITEM_MENU_L10N_IDS.map((l10nID, i) => ({
        menuType: "menuitem" as const,
        l10nID,
        onShowing: (_e, ctx) => {
          libraryItemContextShowing(
            ctx as {
              menuElem?: Element;
              setEnabled?: (enabled: boolean) => void;
              items?: Zotero.Item[];
            },
            LIBRARY_ITEM_MENU_LABELS[i],
          );
        },
        onCommand: () => {
          void Promise.resolve(commands[i]()).catch((err: unknown) => {
            this.log(
              `Menu command failed: ${err instanceof Error ? err.message : String(err)}`,
            );
          });
        },
      }));

    const menus: Zotero.MenuManager.MenuData[] = [
      {
        menuType: "submenu",
        l10nID: LIBRARY_ITEM_SUBMENU_L10N_ID,
        onShowing: (_e, ctx) => {
          libraryItemContextShowing(
            ctx as {
              menuElem?: Element;
              setEnabled?: (enabled: boolean) => void;
              items?: Zotero.Item[];
            },
            "Zotadata",
          );
        },
        menus: actionMenus,
      },
    ];

    const registered = Zotero.MenuManager.registerMenu({
      menuID,
      pluginID,
      target: "main/library/item",
      menus,
    });

    if (registered !== false) {
      this.log("Registered menus using MenuManager API");
    } else {
      this.log(
        "MenuManager.registerMenu returned false; menus may be unavailable",
      );
    }
  }

  private async registerMenusLegacy(): Promise<void> {
    const windows = Zotero.getMainWindows();
    for (const window of windows) {
      if (window.ZoteroPane) {
        await this.addToWindow(window);
      }
    }
    this.log("Registered menus using legacy XUL approach");
  }

  private async addToWindow(window: Window): Promise<void> {
    try {
      const doc = window.document;

      const menu = ZoteroUtils.createXULElement(doc, "menu", {
        id: "zotero-itemmenu-zotadata-menu",
        class: "menu-iconic",
        label: "Zotadata",
      });

      const menuPopup = ZoteroUtils.createXULElement(doc, "menupopup", {
        id: "zotero-itemmenu-zotadata-menupopup",
      });

      const menuItems = [
        {
          id: "zotero-itemmenu-zotadata-check",
          label: "Check Attachments",
          handler: () =>
            void this.handleCheckAttachments().catch((err: unknown) => {
              this.log(
                `Menu command failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            }),
        },
        {
          id: "zotero-itemmenu-zotadata-fetch-metadata",
          label: "Fetch Metadata",
          handler: () =>
            void this.handleFetchMetadata().catch((err: unknown) => {
              this.log(
                `Menu command failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            }),
        },
        {
          id: "zotero-itemmenu-zotadata-process-arxiv",
          label: "Process arXiv Items",
          handler: () =>
            void this.handleProcessArxiv().catch((err: unknown) => {
              this.log(
                `Menu command failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            }),
        },
        {
          id: "zotero-itemmenu-zotadata-find-files",
          label: "Find Missing Files",
          handler: () =>
            void this.handleFindFiles().catch((err: unknown) => {
              this.log(
                `Menu command failed: ${err instanceof Error ? err.message : String(err)}`,
              );
            }),
        },
      ];

      for (const item of menuItems) {
        const menuItem = ZoteroUtils.createXULElement(doc, "menuitem", {
          id: item.id,
          label: item.label,
        });

        menuItem.addEventListener("command", item.handler);
        menuPopup.appendChild(menuItem);
        this.addedElementIDs.push(item.id);
      }

      menu.appendChild(menuPopup);
      this.addedElementIDs.push(menu.id);

      const parentMenu = doc.getElementById(MenuParentID.ITEM_CONTEXT);
      if (parentMenu) {
        parentMenu.appendChild(menu);
        this.log("Successfully added menu to window");
      } else {
        throw new Error("Could not find zotero-itemmenu parent element");
      }
    } catch (error) {
      throw this.errorManager.createFromUnknown(error, ErrorType.ZOTERO_ERROR, {
        operation: "addToWindow",
      });
    }
  }

  private async removeFromAllWindows(): Promise<void> {
    try {
      const windows = Zotero.getMainWindows();

      for (const window of windows) {
        if (window.ZoteroPane) {
          await this.removeFromWindow(window);
        }
      }
    } catch (error) {
      throw this.errorManager.createFromUnknown(error, ErrorType.ZOTERO_ERROR, {
        operation: "removeFromAllWindows",
      });
    }
  }

  private async removeFromWindow(window: Window): Promise<void> {
    try {
      const doc = window.document;

      for (const id of this.addedElementIDs) {
        const element = doc.getElementById(id);
        if (element) {
          element.remove();
          this.log(`Removed element: ${id}`);
        }
      }
    } catch (error) {
      throw this.errorManager.createFromUnknown(error, ErrorType.ZOTERO_ERROR, {
        operation: "removeFromWindow",
      });
    }
  }

  private async handleCheckAttachments(): Promise<void> {
    return this.errorManager.wrapAsync(
      async () => {
        this.log("Check Attachments command triggered");

        const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
        if (selectedItems.length === 0) {
          this.showZotadataToast(
            TOAST_OPERATION.checkAttachments,
            "No items selected.",
            { short: true },
          );
          return;
        }

        this.log(`Checking attachments for ${selectedItems.length} items`);

        const results = await Promise.allSettled(
          selectedItems.map((item) =>
            this.attachmentChecker.checkItemAttachments(item),
          ),
        );

        const successfulResults = results
          .filter(
            (r): r is PromiseFulfilledResult<any> => r.status === "fulfilled",
          )
          .map((r) => r.value);

        if (successfulResults.length === 0) {
          this.showZotadataToast(
            TOAST_OPERATION.checkAttachments,
            "No attachment checks completed successfully.",
          );
          return;
        }

        if (selectedItems.length === 1) {
          const stats = successfulResults[0];
          const message = this.attachmentChecker.generateResultsMessage(stats);
          this.showZotadataToast(TOAST_OPERATION.checkAttachments, message);
        } else {
          const totalStats = successfulResults.reduce(
            (acc, stats) => ({
              valid: acc.valid + (stats.valid || 0),
              removed: acc.removed + (stats.removed || 0),
              weblinks: acc.weblinks + (stats.weblinks || 0),
              errors: acc.errors + (stats.errors || 0),
            }),
            { valid: 0, removed: 0, weblinks: 0, errors: 0 },
          );

          const message = this.attachmentChecker.generateResultsMessage(
            totalStats,
            selectedItems.length,
          );
          this.showZotadataToast(TOAST_OPERATION.checkAttachments, message);
        }
      },
      ErrorType.ZOTERO_ERROR,
      { operation: "handleCheckAttachments" },
    );
  }

  private async handleFetchMetadata(): Promise<void> {
    return this.errorManager.wrapAsync(
      async () => {
        this.log("Fetch Metadata command triggered");

        const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
        if (selectedItems.length === 0) {
          this.showZotadataToast(
            TOAST_OPERATION.fetchMetadata,
            "No items selected.",
            { short: true },
          );
          return;
        }

        const results =
          await this.getMetadataFetcher().fetchMetadataForSelectedItems();
        this.showZotadataToast(
          TOAST_OPERATION.fetchMetadata,
          this.formatMetadataFetchSummary(results),
        );
      },
      ErrorType.ZOTERO_ERROR,
      { operation: "handleFetchMetadata" },
    );
  }

  private getMetadataFetcher(): MetadataFetcher {
    if (!this.metadataFetcher) {
      this.metadataFetcher = new MetadataFetcher({
        config: {
          ...this.config,
          downloads: { maxConcurrent: this.config.maxConcurrentDownloads },
        },
      });
    }
    return this.metadataFetcher;
  }

  private getArxivProcessor(): ArxivProcessor {
    if (!this.arxivProcessor) {
      this.arxivProcessor = new ArxivProcessor();
    }
    return this.arxivProcessor;
  }

  private getFileFinder(): FileFinder {
    if (!this.fileFinder) {
      this.fileFinder = new FileFinder();
    }
    return this.fileFinder;
  }

  private formatMetadataFetchSummary(results: MetadataResult[]): string {
    if (results.length === 0) {
      return "No metadata results.";
    }

    if (results.length === 1) {
      const r = results[0];
      if (r.success) {
        const lines = [`Updated metadata from ${r.source}.`];
        if (r.changes.length > 0) {
          lines.push(...r.changes.map((c) => `• ${c}`));
        } else {
          lines.push("No field changes were applied.");
        }
        return lines.join("\n");
      }
      return `Could not fetch metadata: ${r.errors.join("; ")}`;
    }

    const ok = results.filter((r) => r.success).length;
    const lines = [
      `${ok} of ${results.length} item(s) updated${ok === results.length ? "." : " (see below for failures)."}`,
    ];
    const failed = results.filter((r) => !r.success);
    if (failed.length > 0) {
      const detail = failed.slice(0, 5).map((r) => {
        const title =
          (r.item.getField("title") as string) || `Item ${r.item.id}`;
        return `• ${title}: ${r.errors.join("; ")}`;
      });
      lines.push("Not updated:", ...detail);
      if (failed.length > 5) {
        lines.push(`… and ${failed.length - 5} more not listed`);
      }
    }
    return lines.join("\n");
  }

  private async handleProcessArxiv(): Promise<void> {
    return this.errorManager.wrapAsync(
      async () => {
        this.log("Process arXiv Items command triggered");

        const summary = await this.getArxivProcessor().processSelectedItems();
        this.showZotadataToast(TOAST_OPERATION.processArxiv, summary);
      },
      ErrorType.ZOTERO_ERROR,
      { operation: "handleProcessArxiv" },
    );
  }

  private async handleFindFiles(): Promise<void> {
    return this.errorManager.wrapAsync(
      async () => {
        this.log("Find Missing Files command triggered");

        const summary = await this.getFileFinder().findFilesForSelectedItems();
        this.showZotadataToast(TOAST_OPERATION.findFiles, summary);
      },
      ErrorType.ZOTERO_ERROR,
      { operation: "handleFindFiles" },
    );
  }

  /**
   * Non-blocking completion summary via `ProgressWindow` (avoids modal `alert()`).
   */
  private showZotadataToast(
    operationName: string,
    detailText: string,
    options?: { short?: boolean },
  ): void {
    const rawLines = detailText
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0);
    const max = ZotadataPlugin.TOAST_MAX_LINES;
    let lines: string[];
    if (rawLines.length <= max) {
      lines = rawLines;
    } else {
      const head = rawLines.slice(0, max - 1);
      const rest = rawLines.length - head.length;
      lines = [...head, `… and ${rest} more line(s) not shown`];
    }

    try {
      const win = new Zotero.ProgressWindow({ closeOnClick: true });
      win.changeHeadline(`Zotadata · ${operationName}`);
      if (lines.length === 0) {
        win.addDescription("Done.");
      } else {
        for (const line of lines) {
          win.addDescription(line);
        }
      }
      win.show();
      const ms = options?.short
        ? 4000
        : Math.min(14500, 4300 + lines.length * 520);
      win.startCloseTimer(ms);
    } catch (error) {
      this.log(`ProgressWindow unavailable, falling back to alert: ${error}`);
      this.showAlertFallback(`${operationName}\n\n${detailText}`);
    }
  }

  private showAlertFallback(message: string): void {
    try {
      const windows = Zotero.getMainWindows();
      if (windows.length > 0) {
        void Promise.resolve(windows[0].alert(message)).catch(() => {});
      }
    } catch (error) {
      this.log(`Failed to show message: ${error}`);
    }
  }

  private log(message: string): void {
    if (typeof Zotero !== "undefined" && Zotero.log) {
      Zotero.log(`Zotadata: ${message}`);
    } else {
      console.log(`Zotadata: ${message}`);
    }
  }
}
