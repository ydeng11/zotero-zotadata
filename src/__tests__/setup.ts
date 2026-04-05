// src/__tests__/setup.ts
// Mock Zotero 8 globals for testing

import { beforeEach } from 'vitest';
import { createLiveHTTP, createMockHTTP } from '../../tests/__mocks__/zotero-http';
import { createMockPrefs, clearPrefs } from '../../tests/__mocks__/zotero-prefs';
import {
  getAllMockItems,
  getMockItemById,
  installLiveAttachmentAdapters,
  resetMockCounters,
  trashMockItems,
} from '../../tests/__mocks__/zotero-items';

/** Recorded calls for Zotero 8 MenuManager (Vitest assertions). */
const menuManagerRegisterCalls: Array<{
  menuID: string;
  pluginID: string;
  target: string;
  menus: Array<{ menuType: string; l10nID?: string }>;
}> = [];
const menuManagerUnregisterCalls: string[] = [];

function resetMenuManagerMocks(): void {
  menuManagerRegisterCalls.length = 0;
  menuManagerUnregisterCalls.length = 0;
}

const ITEM_TYPE_NAMES: Record<number, string> = {
  1: 'journalArticle',
  2: 'book',
  3: 'conferencePaper',
  4: 'preprint',
};

const ITEM_TYPE_IDS = Object.fromEntries(
  Object.entries(ITEM_TYPE_NAMES).map(([id, name]) => [name, Number(id)]),
) as Record<string, number>;

function isLiveAPIMode(): boolean {
  return process.env.LIVE_API_TESTS === '1';
}

function resetItemAccessors(): void {
  (globalThis as any).Zotero.Items.get = (id: number) => getMockItemById(id);
  (globalThis as any).Zotero.Items.getAll = () => getAllMockItems();
  (globalThis as any).Zotero.Items.trash = async (ids: number | number[]) =>
    trashMockItems(ids);
}

function installDefaultAttachmentAdapters(): void {
  (globalThis as any).Zotero.Attachments.importFromURL = async () => null;
  (globalThis as any).Zotero.Attachments.importFromFile = async () => null;
  (globalThis as any).Zotero.Attachments.importFromBuffer = async () => null;
}

(globalThis as any).__menuManagerRegisterCalls = menuManagerRegisterCalls;
(globalThis as any).__menuManagerUnregisterCalls = menuManagerUnregisterCalls;
(globalThis as any).__resetMenuManagerMocks = resetMenuManagerMocks;

// Mock Zotero object
(globalThis as any).Zotero = {
  log: console.log,
  initializationPromise: Promise.resolve(),
  unlockPromise: Promise.resolve(),
  uiReadyPromise: Promise.resolve(),
  getMainWindows: () => [],
  getActiveZoteroPane: () => null,
  platformMajorVersion: 140,
  Items: {
    get: (id: number) => getMockItemById(id),
    getAll: () => getAllMockItems(),
    trash: async (ids: number | number[]) => trashMockItems(ids),
  },
  Attachments: {
    LINK_MODE_LINKED_URL: 1,
    LINK_MODE_IMPORTED_FILE: 2,
    LINK_MODE_LINKED_FILE: 3,
    LINK_MODE_IMPORTED_URL: 4,
    importFromURL: async () => null,
    importFromFile: async () => null,
    importFromBuffer: async () => null,
  },
  HTTP: {
    request: async () => ({
      status: 200,
      responseText: '{}',
      response: '{}',
      getResponseHeader: () => null,
    }),
  },
  ItemTypes: {
    getName: (id: number) => ITEM_TYPE_NAMES[id] ?? 'journalArticle',
    getID: (name: string) => ITEM_TYPE_IDS[name] ?? 1,
  },
  CreatorTypes: {
    getPrimaryIDForType: () => 1,
  },
  Date: {
    strToDate: (value: string) => ({
      year: value.match(/\d{4}/)?.[0],
    }),
  },
  // Zotero 8 Menu API mock (registerMenu returns string | false, like runtime)
  MenuManager: {
    registerMenu: (options: {
      menuID: string;
      pluginID: string;
      target: string;
      menus: Array<{ menuType: string; l10nID?: string }>;
    }) => {
      menuManagerRegisterCalls.push(options);
      return options.menuID;
    },
    unregisterMenu: (menuID: string) => {
      menuManagerUnregisterCalls.push(menuID);
      return true;
    },
  },
  Notifier: {
    registerObserver: () => 'test-id',
    unregisterObserver: () => {},
  },
  Utilities: {
    cleanURL: (url: string) => url,
    cleanDOI: (doi: string) =>
      doi
        .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, '')
        .replace(/^doi:\s*/i, '')
        .trim(),
    cleanISBN: (isbn: string) => isbn,
  },
};

// Mock Services global (auto-imported in Firefox 128+)
(globalThis as any).Services = {
  wm: {
    addListener: () => {},
    removeListener: () => {},
    getEnumerator: () => ({
      hasMoreElements: () => false,
      getNext: () => null,
    }),
  },
  scriptloader: {
    loadSubScript: () => {},
  },
  io: {
    newURI: (uri: string) => ({ spec: uri }),
  },
};

// Mock ChromeUtils
(globalThis as any).ChromeUtils = {
  defineLazyGetter: (obj: any, name: string, getter: () => any) => {
    Object.defineProperty(obj, name, { get: getter });
  },
  defineESModuleGetters: () => {},
};

// Mock document.createXULElement for DOM tests
if (typeof document !== 'undefined') {
  (document as any).createXULElement = document.createElement.bind(document);
}

// Extend Zotero mock with test utilities
(globalThis as any).Zotero.Prefs = createMockPrefs();

// Helper to reset HTTP mock with fixtures
(globalThis as any).__resetHTTPMock = () => {
  (globalThis as any).Zotero.HTTP = isLiveAPIMode()
    ? createLiveHTTP()
    : createMockHTTP();
};

// Helper to set custom HTTP mock
(globalThis as any).__setHTTPMock = (mock: any) => {
  (globalThis as any).Zotero.HTTP = mock;
};

// Reset mocks between tests
beforeEach(() => {
  (globalThis as any).__resetHTTPMock?.();
  (globalThis as any).__resetMenuManagerMocks?.();
  clearPrefs();
  resetMockCounters();
  resetItemAccessors();
  if (isLiveAPIMode()) {
    installLiveAttachmentAdapters();
  } else {
    installDefaultAttachmentAdapters();
  }
});
