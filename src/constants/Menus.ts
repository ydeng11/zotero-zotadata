// src/constants/Menus.ts

/**
 * XUL namespace for creating XUL elements
 */
export const XUL_NAMESPACE =
  "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul";

/**
 * Platform version threshold for createXULElement support
 * Zotero 102+ (Firefox 102+) supports document.createXULElement
 */
export const PLATFORM_VERSION_CREATE_XUL = 102;

/**
 * Menu parent IDs
 */
export const MenuParentID = {
  ITEM_CONTEXT: "zotero-itemmenu",
  COLLECTION_CONTEXT: "zotero-collectionmenu",
  TOOLS_POPUP: "menu_ToolsPopup",
  TOOLBAR: "zotero-toolbar",
  TOOLBAR_SEPARATOR: "zotero-toolbar-separator",
} as const;

/**
 * Menu item IDs for the Zotadata plugin
 */
export const MenuItemID = {
  // Item context menu
  FIND_ATTACHMENTS: "zotero-itemmenu-zotadata-find",
  CHECK_ATTACHMENTS: "zotero-itemmenu-zotadata-check",
  FETCH_METADATA: "zotero-itemmenu-zotadata-fetch-metadata",
  PROCESS_ARXIV: "zotero-itemmenu-zotadata-process-arxiv",
} as const;

/** Parent submenu for the four library item actions (Zotero 8 MenuManager). */
export const LIBRARY_ITEM_SUBMENU_L10N_ID = "zotadata-submenu" as const;

/**
 * Fluent IDs for Zotero 8 MenuManager (main/library/item).
 * Must match keys in addon/locale (e.g. en-US/mainWindow.ftl) with a `.label` attribute.
 */
export const LIBRARY_ITEM_MENU_L10N_IDS = [
  "zotadata-menu-check-attachments",
  "zotadata-menu-fetch-metadata",
  "zotadata-menu-process-arxiv",
  "zotadata-menu-find-files",
] as const;

/** L10n ID for the Settings menu */
export const SETTINGS_L10N_ID = "zotadata-menu-settings" as const;

/** Fallback labels if Fluent is not bound (legacy / tests). */
export const LIBRARY_ITEM_MENU_LABELS = [
  "Validate References",
  "Update Metadata",
  "Process Preprints",
  "Retrieve Files",
] as const;

/** Fallback label for Settings */
export const SETTINGS_LABEL = "Settings" as const;
