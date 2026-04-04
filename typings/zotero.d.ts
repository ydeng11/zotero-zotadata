// Zotero 8 type definitions
// This extends the zotero-types package with additional definitions

declare global {
  namespace Zotero {
    // Item interface
    interface Item {
      id: number;
      itemTypeID: number;
      getField(field: string): string;
      setField(field: string, value: string): void;
      setType(typeID: number): void;
      addTag(name: string, color?: number): void;
      save(): Promise<void>;
      isRegularItem(): boolean;
      isTopLevelItem(): boolean;
      isAttachment(): boolean;
      isNote(): boolean;
      saveTx(): Promise<void>;
      getSource(): number | null;
      parentID: number;
      attachmentLinkMode: number;
      attachmentContentType: string;
      getFilePath(): string | false;
      getFile(): any;
      fileExists(): Promise<boolean>;
      isEditable?(op?: 'edit' | 'erase'): boolean;
      setNote(note: string): void;
      getCreators(): Array<{
        firstName?: string;
        lastName: string;
        name?: string;
        creatorType: string;
      }>;
      setCreators(creators: Array<{
        firstName?: string;
        lastName: string;
        creatorType: string;
      }>): void;
      getAttachments(): number[];
      addAttachment(options: {
        url?: string;
        path?: string;
        title?: string;
        contentType?: string;
        charset?: string;
      }): Promise<number>;
    }

    interface Collection {
      id: number;
      name: string;
      getChildItems(): Item[];
    }

    interface Library {
      id: number;
      name: string;
    }

    namespace Items {
      function get(id: number): Item | null;
      function getAll(): Item[];
      /** Move item(s) to trash (Zotero 7+); do not use setField('deleted', …). */
      function trash(ids: number | number[]): Promise<void>;
    }

    namespace Collections {
      function get(id: number): Collection | null;
      function getAll(): Collection[];
    }

    namespace ItemTypes {
      function getName(id: number): string;
      function getID(name: string): number;
    }

    namespace Attachments {
      const LINK_MODE_LINKED_URL: number;
      const LINK_MODE_IMPORTED_FILE: number;
      const LINK_MODE_LINKED_FILE: number;

      function importFromURL(options: {
        url: string;
        parentItemID?: number;
        title?: string;
        fileBaseName?: string;
        contentType?: string;
        referrer?: string;
        cookieSandbox?: any;
      }): Promise<Item>;

      function importFromFile(options: {
        file: any;
        parentItemID?: number;
        title?: string;
      }): Promise<Item>;

      function linkFromURL(options: {
        url: string;
        parentItemID: number;
        title: string;
        contentType: string;
      }): Promise<Item>;

      function importFromBuffer(options: {
        buffer: ArrayBuffer;
        fileName: string;
        contentType: string;
        parentItemID: number;
      }): Promise<Item>;
    }

    namespace HTTP {
      function request(method: string, url: string, options?: {
        headers?: Record<string, string>;
        body?: string | ArrayBuffer;
        responseType?: string;
        timeout?: number;
        successCodes?: number[];
      }): Promise<{
        status: number;
        response: any;
        responseText: string;
        getResponseHeader(header: string): string | null;
      }>;
    }

    namespace Utilities {
      function cleanURL(url: string): string;
      function cleanDOI(doi: string): string;
      function cleanISBN(isbn: string): string;
    }

    namespace Notifier {
      function registerObserver(
        callback: (event: string, type: string, ids: number[], extraData: any) => void,
        types?: string[]
      ): string;
      function unregisterObserver(id: string): void;
    }

    /**
     * Zotero 8+ menu registration (single options object with menuID, target, menus).
     */
    namespace MenuManager {
      interface MenuData {
        menuType: 'menuitem' | 'separator' | 'submenu';
        l10nID?: string;
        onCommand?: (event: Event, context: unknown) => void | void;
        onShowing?: (event: Event, context: unknown) => void | void;
      }

      interface MenuOptions {
        menuID: string;
        pluginID: string;
        /** e.g. main/library/item, main/library/collection, main/menubar/tools */
        target: string;
        menus: MenuData[];
      }

      function registerMenu(options: MenuOptions): string | false;

      function unregisterMenu(menuID: string): boolean;
    }

    // Prefs API
    namespace Prefs {
      function get(key: string, defaultValue?: any): any;
      function set(key: string, value: any): void;
      function registerObserver(key: string, callback: () => void): void;
      function unregisterObserver(key: string, callback: () => void): void;
    }

    // File API
    namespace File {
      function getContents(file: any): string;
      function writeToFile(file: any, contents: string): void;
      function exists(file: any): boolean;
    }

    // ProgressWindow
    class ProgressWindow {
      constructor(options?: { closeOnClick?: boolean; window?: Window });
      changeHeadline(text: string): void;
      addDescription(text: string): void;
      addLines(label: string, icon?: string): void;
      show(): void;
      close(): void;
      startCloseTimer(delay?: number): void;
    }

    // Item class constructor
    class Item {
      constructor(type: string);
      id: number;
      itemTypeID: number;
      parentID: number;
      getField(field: string): string;
      setField(field: string, value: string): void;
      save(): Promise<void>;
      saveTx(): Promise<void>;
      setNote(note: string): void;
    }

    function log(message: string, level?: number): void;
    const initializationPromise: Promise<void>;
    const unlockPromise: Promise<void>;
    const uiReadyPromise: Promise<void>;
    function getMainWindows(): Window[];
    function getMainWindow(): Window;
    function getActiveZoteroPane(): {
      getSelectedItems(): Item[];
      getSelectedCollection(): Collection | null;
    } | null;
    function getTempDirectory(): any;

    const platformMajorVersion: number;
  }

  // Firefox/XUL global interfaces
  const Cc: nsIXPCComponents_Classes;
  const Ci: nsIXPCComponents_Interfaces;
  const Cu: typeof Components.utils;

  // Services is auto-imported in Firefox 128+
  const Services: {
    wm: {
      addListener(listener: any): void;
      removeListener(listener: any): void;
      getEnumerator(windowType: string): any;
    };
    scriptloader: {
      loadSubScript(url: string, target?: any): void;
    };
    io: {
      newURI(uri: string): any;
    };
    prompt: {
      confirmEx(
        parent: Window,
        title: string,
        text: string,
        flags: number,
        btn0?: string | null,
        btn1?: string | null,
        btn2?: string | null,
        checkText?: string | null,
        checkState?: Record<string, unknown>,
      ): number;
    };
    [key: string]: any;
  };

  const ChromeUtils: {
    defineLazyGetter(obj: any, name: string, getter: () => any): void;
    defineESModuleGetters(obj: any, modules: Record<string, string>): void;
  };

  // Legacy globals (kept for compatibility during migration)
  const Components: any;
  const APP_SHUTDOWN: number;

  interface Window {
    ZoteroPane?: any;
    alert(message: string): void;
  }

  interface Document {
    createXULElement(name: string): Element;
    getElementById(id: string): HTMLElement | null;
    createElementNS(namespace: string, tagName: string): Element;
  }
}

interface nsIXPCComponents_Classes {
  [key: string]: any;
}

interface nsIXPCComponents_Interfaces {
  nsIWindowMediator: any;
  nsIDOMWindow: any;
  nsIInterfaceRequestor: any;
}

export {};