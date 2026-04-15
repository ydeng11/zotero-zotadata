import { ErrorManager, ErrorType } from "@/shared/core";
import type { AddonData } from "@/shared/core/types";
import { ZoteroUtils } from "@/shared/utils/ZoteroUtils";
import { MenuParentID } from "@/constants/Menus";

/**
 * Menu item configuration
 */
interface MenuItemConfig {
  id: string;
  label: string;
  icon?: string;
  tooltip?: string;
  action?: () => Promise<void> | void;
  condition?: () => boolean;
  separator?: boolean;
  submenu?: MenuItemConfig[];
}

/**
 * Menu section configuration
 */
interface MenuSection {
  id: string;
  items: MenuItemConfig[];
  insertAfter?: string;
  insertBefore?: string;
}

/**
 * Menu context types
 */
type MenuContext = "item" | "collection" | "toolbar" | "tools";

/**
 * Menu Manager for creating and managing UI elements
 */
export class MenuManager {
  private addonData: AddonData;
  private errorManager: ErrorManager;
  private registeredMenus = new Map<string, HTMLElement>();
  private eventListeners = new Map<string, () => void>();
  private useNewMenuAPI = false;
  private notifierObserverID: string | null = null;
  private menuConditions = new Map<string, () => boolean>();

  constructor(addonData: AddonData) {
    this.addonData = addonData;
    this.errorManager = new ErrorManager();
    // Check if new Menu API is available (Zotero 8+)
    this.useNewMenuAPI = ZoteroUtils.hasNewMenuAPI();
  }

  /**
   * Initialize all menus
   */
  async init(): Promise<void> {
    try {
      if (this.useNewMenuAPI) {
        await this.initWithNewMenuAPI();
      } else {
        await this.initWithLegacyMenus();
      }
    } catch (error) {
      throw this.errorManager.createFromUnknown(error, ErrorType.ZOTERO_ERROR, {
        operation: "initMenus",
      });
    }
  }

  /**
   * Initialize menus using new Zotero 8 Menu API
   */
  private async initWithNewMenuAPI(): Promise<void> {
    const pluginID = this.addonData.id;

    const itemMenus: Zotero.MenuManager.MenuData[] = [
      {
        menuType: "menuitem",
        l10nID: "zotadata-menu-find-attachments",
        onShowing: (_e, ctx) => {
          const c = ctx as { setVisible?: (v: boolean) => void };
          c.setVisible?.(this.hasValidSelectedItems());
        },
        onCommand: () => {
          void this.handleFindAttachments();
        },
      },
      {
        menuType: "menuitem",
        l10nID: "zotadata-menu-check-attachments",
        onShowing: (_e, ctx) => {
          const c = ctx as { setVisible?: (v: boolean) => void };
          c.setVisible?.(this.hasValidSelectedItems());
        },
        onCommand: () => {
          void this.handleCheckAttachments();
        },
      },
      {
        menuType: "menuitem",
        l10nID: "zotadata-menu-fetch-metadata",
        onShowing: (_e, ctx) => {
          const c = ctx as { setVisible?: (v: boolean) => void };
          c.setVisible?.(this.hasValidSelectedItems());
        },
        onCommand: () => {
          void this.handleFetchMetadata();
        },
      },
      {
        menuType: "menuitem",
        l10nID: "zotadata-menu-process-arxiv",
        onShowing: (_e, ctx) => {
          const c = ctx as { setVisible?: (v: boolean) => void };
          c.setVisible?.(this.hasArxivItems());
        },
        onCommand: () => {
          void this.handleProcessArxiv();
        },
      },
    ];

    const collectionMenus: Zotero.MenuManager.MenuData[] = [
      {
        menuType: "menuitem",
        l10nID: "zotadata-menu-batch-find",
        onShowing: (_e, ctx) => {
          const c = ctx as { setVisible?: (v: boolean) => void };
          c.setVisible?.(this.hasSelectedCollection());
        },
        onCommand: () => {
          void this.handleBatchFindAttachments();
        },
      },
      {
        menuType: "menuitem",
        l10nID: "zotadata-menu-batch-clean",
        onShowing: (_e, ctx) => {
          const c = ctx as { setVisible?: (v: boolean) => void };
          c.setVisible?.(this.hasSelectedCollection());
        },
        onCommand: () => {
          void this.handleBatchCheckAttachments();
        },
      },
    ];

    const toolsMenus: Zotero.MenuManager.MenuData[] = [
      {
        menuType: "menuitem",
        l10nID: "zotadata-menu-preferences",
        onCommand: () => {
          void this.handlePreferences();
        },
      },
      {
        menuType: "menuitem",
        l10nID: "zotadata-menu-status",
        onCommand: () => {
          void this.handleShowStatus();
        },
      },
    ];

    const registrations: Array<{
      menuID: string;
      target: string;
      menus: Zotero.MenuManager.MenuData[];
    }> = [
      {
        menuID: "zotadata-attachment-finder-library-item",
        target: "main/library/item",
        menus: itemMenus,
      },
      {
        menuID: "zotadata-attachment-finder-library-collection",
        target: "main/library/collection",
        menus: collectionMenus,
      },
      {
        menuID: "zotadata-attachment-finder-menubar-tools",
        target: "main/menubar/tools",
        menus: toolsMenus,
      },
    ];

    for (const reg of registrations) {
      try {
        const ok = Zotero.MenuManager.registerMenu({
          menuID: reg.menuID,
          pluginID,
          target: reg.target,
          menus: reg.menus,
        });
        if (ok === false) {
          console.warn(`MenuManager.registerMenu failed for ${reg.menuID}`);
        }
      } catch (error) {
        console.warn(`Failed to register menu ${reg.menuID}:`, error);
      }
    }
  }

  /**
   * Initialize menus using legacy XUL-based approach
   */
  private async initWithLegacyMenus(): Promise<void> {
    this.setupSelectionNotifier();
    await this.createItemContextMenu();
    await this.createCollectionContextMenu();
    await this.createToolsMenu();
    await this.createToolbarButtons();
  }

  /**
   * Clean up all menus and listeners
   */
  async cleanup(): Promise<void> {
    try {
      // Unregister Notifier observer
      if (this.notifierObserverID) {
        try {
          Zotero.Notifier.unregisterObserver(this.notifierObserverID);
        } catch {}
        this.notifierObserverID = null;
      }

      // Clear menu conditions
      this.menuConditions.clear();

      // Do not call MenuManager.unregisterMenu — Zotero clears plugin menu
      // registrations on addon shutdown; duplicate unregister warns.

      // Remove all registered menus
      for (const [id, element] of this.registeredMenus) {
        element.remove?.();
      }
      this.registeredMenus.clear();

      // Remove all event listeners
      for (const [id, cleanup] of this.eventListeners) {
        cleanup();
      }
      this.eventListeners.clear();
    } catch (error) {
      console.warn("Error cleaning up menus:", error);
    }
  }

  /**
   * Register Notifier observer for selection changes
   */
  private setupSelectionNotifier(): void {
    // Use Zotero's Notifier API for efficient selection change detection
    this.notifierObserverID = Zotero.Notifier.registerObserver(
      (event, type, ids, extraData) => {
        // Only react to select events in the items tree
        if (type === "select" && event === "select") {
          this.updateAllMenuVisibility();
        }
      },
      ["select"],
    );
  }

  /**
   * Update visibility of all menus with conditions
   */
  private updateAllMenuVisibility(): void {
    for (const [id, element] of this.registeredMenus) {
      const condition = this.menuConditions.get(id);
      if (condition) {
        const isVisible = condition();
        element.hidden = !isVisible;
      }
    }
  }

  /**
   * Create item context menu
   */
  private async createItemContextMenu(): Promise<void> {
    const itemMenuConfig: MenuSection = {
      id: "attachment-finder-item",
      insertAfter: "zotero-itemmenu-separator-1",
      items: [
        {
          id: "zotero-itemmenu-attachment-finder-find",
          label: "Find Attachments",
          icon: "chrome://zotero/skin/attach.png",
          tooltip: "Search for and download attachments for selected items",
          action: () => this.handleFindAttachments(),
          condition: () => this.hasValidSelectedItems(),
        },
        {
          id: "zotero-itemmenu-attachment-finder-check",
          label: "Validate References",
          icon: "chrome://zotero/skin/cross.png",
          tooltip: "Check and clean up existing attachments",
          action: () => this.handleCheckAttachments(),
          condition: () => this.hasValidSelectedItems(),
        },
        {
          id: "zotero-itemmenu-attachment-finder-metadata",
          label: "Update Metadata",
          icon: "chrome://zotero/skin/treeitem-book.png",
          tooltip: "Fetch additional metadata from academic APIs",
          action: () => this.handleFetchMetadata(),
          condition: () => this.hasValidSelectedItems(),
        },
        {
          id: "zotero-itemmenu-attachment-finder-separator",
          label: "",
          separator: true,
        },
        {
          id: "zotero-itemmenu-attachment-finder-arxiv",
          label: "Process Preprints",
          icon: "chrome://zotero/skin/treeitem-attachment-pdf.png",
          tooltip: "Process and download PDFs for arXiv preprints",
          action: () => this.handleProcessArxiv(),
          condition: () => this.hasArxivItems(),
        },
        {
          id: "zotero-itemmenu-attachment-finder-files",
          label: "Retrieve Files",
          icon: "chrome://zotero/skin/attach.png",
          tooltip: "Search for and download missing files",
          action: () => this.handleFindFiles(),
          condition: () => this.hasValidSelectedItems(),
        },
      ],
    };

    await this.createMenuSection(MenuParentID.ITEM_CONTEXT, itemMenuConfig);
  }

  /**
   * Create collection context menu
   */
  private async createCollectionContextMenu(): Promise<void> {
    const collectionMenuConfig: MenuSection = {
      id: "attachment-finder-collection",
      insertAfter: "zotero-collectionmenu-separator",
      items: [
        {
          id: "zotero-collectionmenu-attachment-finder-batch",
          label: "Batch Find Attachments",
          icon: "chrome://zotero/skin/attach.png",
          tooltip: "Find attachments for all items in this collection",
          action: () => this.handleBatchFindAttachments(),
          condition: () => this.hasSelectedCollection(),
        },
        {
          id: "zotero-collectionmenu-attachment-finder-clean",
          label: "Clean Collection Attachments",
          icon: "chrome://zotero/skin/cross.png",
          tooltip:
            "Check and clean attachments for all items in this collection",
          action: () => this.handleBatchCheckAttachments(),
          condition: () => this.hasSelectedCollection(),
        },
      ],
    };

    await this.createMenuSection(
      MenuParentID.COLLECTION_CONTEXT,
      collectionMenuConfig,
    );
  }

  /**
   * Create Tools menu entries
   */
  private async createToolsMenu(): Promise<void> {
    const toolsMenuConfig: MenuSection = {
      id: "attachment-finder-tools",
      insertBefore: "menu_Tools_Popup-separator-1",
      items: [
        {
          id: "tools-attachment-finder-preferences",
          label: "Settings...",
          icon: "chrome://zotero/skin/prefs.png",
          tooltip: "Configure Zotadata settings",
          action: () => this.handlePreferences(),
        },
        {
          id: "tools-attachment-finder-status",
          label: "Zotadata Status",
          icon: "chrome://zotero/skin/report.png",
          tooltip: "Show plugin status and statistics",
          action: () => this.handleShowStatus(),
        },
      ],
    };

    await this.createMenuSection(MenuParentID.TOOLS_POPUP, toolsMenuConfig);
  }

  /**
   * Create toolbar buttons
   */
  private async createToolbarButtons(): Promise<void> {
    const toolbar = document.getElementById(MenuParentID.TOOLBAR);
    if (!toolbar) return;

    // Main action button
    const findButton = ZoteroUtils.createXULElement(document, "toolbarbutton", {
      id: "attachment-finder-find-button",
      label: "Find Attachments",
      tooltiptext: "Find attachments for selected items",
      image: "chrome://zotero/skin/attach.png",
      oncommand: () => this.handleFindAttachments(),
    }) as HTMLElement;

    // Add button to toolbar
    const insertPoint =
      document.getElementById(MenuParentID.TOOLBAR_SEPARATOR) ||
      toolbar.lastElementChild;
    if (insertPoint) {
      toolbar.insertBefore(findButton, insertPoint);
      this.registeredMenus.set("attachment-finder-find-button", findButton);
    }
  }

  /**
   * Create a menu section with items
   */
  private async createMenuSection(
    parentMenuId: string,
    config: MenuSection,
  ): Promise<void> {
    const parentMenu = document.getElementById(parentMenuId);
    if (!parentMenu) {
      console.warn(`Parent menu not found: ${parentMenuId}`);
      return;
    }

    let insertPoint: Element | null = null;

    // Find insertion point
    if (config.insertAfter) {
      insertPoint = document.getElementById(config.insertAfter);
      if (insertPoint) {
        insertPoint = insertPoint.nextElementSibling;
      }
    } else if (config.insertBefore) {
      insertPoint = document.getElementById(config.insertBefore);
    }

    // Create menu items
    for (const itemConfig of config.items) {
      const menuItem = await this.createMenuItem(itemConfig);
      if (menuItem) {
        if (insertPoint) {
          parentMenu.insertBefore(menuItem, insertPoint);
        } else {
          parentMenu.appendChild(menuItem);
        }
        this.registeredMenus.set(itemConfig.id, menuItem);
      }
    }
  }

  /**
   * Create a single menu item
   */
  private async createMenuItem(
    config: MenuItemConfig,
  ): Promise<HTMLElement | null> {
    try {
      if (config.separator) {
        return ZoteroUtils.createXULElement(document, "menuseparator", {
          id: config.id,
        }) as HTMLElement;
      }

      const attributes: Record<string, any> = {
        id: config.id,
        label: config.label,
      };

      if (config.icon) {
        attributes.image = config.icon;
      }

      if (config.tooltip) {
        attributes.tooltiptext = config.tooltip;
      }

      // Add condition check
      if (config.condition) {
        attributes.hidden = !config.condition();
        // Store condition for later evaluation by Notifier
        this.menuConditions.set(config.id, config.condition);
      }

      const menuItem = ZoteroUtils.createXULElement(
        document,
        "menuitem",
        attributes,
      ) as HTMLElement;

      // Add click handler
      const handleClick = () => {
        try {
          if (config.action) {
            config.action();
          }
        } catch (error) {
          this.errorManager.handleError(
            this.errorManager.createFromUnknown(error, ErrorType.ZOTERO_ERROR, {
              menuItem: config.id,
            }),
          );
        }
      };

      menuItem.addEventListener("command", handleClick);
      this.eventListeners.set(config.id, () => {
        menuItem.removeEventListener("command", handleClick);
      });

      return menuItem;
    } catch (error) {
      console.warn(`Failed to create menu item ${config.id}:`, error);
      return null;
    }
  }

  /**
   * Menu action handlers
   */
  private async handleFindAttachments(): Promise<void> {
    // This would call the main zotadata functionality
    const attachmentFinder = (globalThis as any).Zotero.AttachmentFinder;
    if (attachmentFinder) {
      await attachmentFinder.findSelectedFiles();
    }
  }

  private async handleCheckAttachments(): Promise<void> {
    const attachmentFinder = (globalThis as any).Zotero.AttachmentFinder;
    if (attachmentFinder) {
      await attachmentFinder.checkSelectedItems();
    }
  }

  private async handleFetchMetadata(): Promise<void> {
    const attachmentFinder = (globalThis as any).Zotero.AttachmentFinder;
    if (attachmentFinder) {
      await attachmentFinder.fetchMetadataForSelectedItems();
    }
  }

  private async handleProcessArxiv(): Promise<void> {
    const attachmentFinder = (globalThis as any).Zotero.AttachmentFinder;
    if (attachmentFinder) {
      await attachmentFinder.processArxivItems();
    }
  }

  private async handleFindFiles(): Promise<void> {
    await this.handleFindAttachments();
  }

  private async handleBatchFindAttachments(): Promise<void> {
    // Implementation for batch processing collection items
    console.log("Batch find attachments for collection");
  }

  private async handleBatchCheckAttachments(): Promise<void> {
    // Implementation for batch checking collection items
    console.log("Batch check attachments for collection");
  }

  private async handlePreferences(): Promise<void> {
    // Open preferences dialog
    const preferencesManager = (globalThis as any).Zotero.AttachmentFinder
      ?.preferencesManager;
    if (preferencesManager) {
      await preferencesManager.openPreferences();
    }
  }

  private async handleShowStatus(): Promise<void> {
    // Show status dialog
    console.log("Show zotadata status");
  }

  /**
   * Condition check helpers
   */
  private hasValidSelectedItems(): boolean {
    try {
      const zoteroPane = Zotero.getActiveZoteroPane();
      if (!zoteroPane) return false;

      const selectedItems = zoteroPane.getSelectedItems();
      return (
        selectedItems.length > 0 &&
        selectedItems.some((item) => item.isTopLevelItem())
      );
    } catch {
      return false;
    }
  }

  private hasArxivItems(): boolean {
    try {
      const zoteroPane = Zotero.getActiveZoteroPane();
      if (!zoteroPane) return false;

      const selectedItems = zoteroPane.getSelectedItems();
      return selectedItems.some((item) => {
        const url = item.getField("url") || "";
        const extra = item.getField("extra") || "";
        return url.includes("arxiv.org") || extra.includes("arXiv:");
      });
    } catch {
      return false;
    }
  }

  private hasSelectedCollection(): boolean {
    try {
      const zoteroPane = Zotero.getActiveZoteroPane();
      if (!zoteroPane) return false;

      const selectedCollection = zoteroPane.getSelectedCollection();
      return !!selectedCollection;
    } catch {
      return false;
    }
  }

  /**
   * Update menu visibility based on current context
   */
  updateMenuVisibility(): void {
    this.updateAllMenuVisibility();
  }

  /**
   * Enable/disable menu items based on plugin state
   */
  setMenusEnabled(enabled: boolean): void {
    for (const [id, element] of this.registeredMenus) {
      if (element.hasAttribute("label")) {
        // Skip separators
        element.setAttribute("disabled", enabled ? "false" : "true");
      }
    }
  }

  /**
   * Get menu statistics
   */
  getStats(): {
    registeredMenus: number;
    eventListeners: number;
  } {
    return {
      registeredMenus: this.registeredMenus.size,
      eventListeners: this.eventListeners.size,
    };
  }
}
