// Basic Zotero type definitions for the zotadata
// This extends the zotero-types package with additional definitions

declare namespace Zotero {
  interface Item {
    id: number;
    itemTypeID: number;
    getField(field: string): string;
    setField(field: string, value: string): void;
    save(): Promise<void>;
    isRegularItem(): boolean;
    isTopLevelItem(): boolean;
    saveTx(): Promise<void>;
    getSource(): number | null;
    parentID: number;
    attachmentLinkMode: number;
    attachmentContentType: string;
    getFilePath(): string | null;
    getFile(): any;
    setNote(note: string): void;
    getCreators(): Array<{
      firstName?: string;
      lastName: string;
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
  }

  namespace ItemTypes {
    function getName(id: number): string;
    function getID(name: string): number;
  }

  namespace Collections {
    function get(id: number): Collection | null;
    function getAll(): Collection[];
  }

  namespace Attachments {
    function importFromURL(options: {
      url: string;
      parentItemID?: number;
      title?: string;
      fileBaseName?: string;
      contentType?: string;
      referrer?: string;
      cookieSandbox?: any;
    }): Promise<number>;

    function importFromFile(options: {
      file: any;
      parentItemID?: number;
      title?: string;
    }): Promise<number>;

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

  // Zotero 8 Menu API
  namespace MenuManager {
    interface MenuOptions {
      pluginID: string;
      label: string;
      icon?: string;
      condition?: () => boolean;
      callback: () => void | Promise<void>;
    }

    function registerMenu(
      menuID: string,
      options: MenuOptions
    ): () => void;

    function unregisterMenu(menuID: string): void;
  }

  function log(message: string, level?: number): void;
  function getMainWindows(): Window[];
  function getActiveZoteroPane(): {
    getSelectedItems(): Item[];
    getSelectedCollection(): Collection | null;
  };
  function getTempDirectory(): any;

  const platformMajorVersion: number;
}

declare global {
  const Zotero: typeof Zotero;

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