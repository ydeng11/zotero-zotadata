// Basic Zotero type definitions for the attachment finder
// This extends the zotero-types package with additional definitions

declare namespace Zotero {
  interface Item {
    id: number;
    itemTypeID: number;
    getField(field: string): string;
    setField(field: string, value: string): void;
    save(): Promise<void>;
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

  function log(message: string, level?: number): void;
  function getMainWindows(): Window[];
  function getActiveZoteroPane(): {
    getSelectedItems(): Item[];
    getSelectedCollection(): Collection | null;
  };

  const platformMajorVersion: number;
}

declare global {
  const Zotero: typeof Zotero;
  const Components: any;
  const Services: any;
  const ChromeUtils: any;
  
  interface Window {
    ZoteroPane?: any;
    alert(message: string): void;
  }
  
  interface Document {
    createXULElement(name: string): Element;
  }
} 