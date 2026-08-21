// src/__tests__/setup.ts
// Mock Zotero 8 globals for testing

import { beforeEach } from "vitest";
import {
  createLiveHTTP,
  createMockHTTP,
} from "../../tests/__mocks__/zotero-http";
import {
  createMockPrefs,
  clearPrefs,
} from "../../tests/__mocks__/zotero-prefs";
import {
  getAllMockItems,
  getMockItemById,
  installLiveAttachmentAdapters,
  resetMockCounters,
  trashMockItems,
} from "../../tests/__mocks__/zotero-items";

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
  1: "journalArticle",
  2: "book",
  3: "conferencePaper",
  4: "preprint",
};

const ITEM_TYPE_IDS = Object.fromEntries(
  Object.entries(ITEM_TYPE_NAMES).map(([id, name]) => [name, Number(id)]),
) as Record<string, number>;

type TestZotero = Omit<typeof Zotero, "HTTP" | "Prefs"> & {
  HTTP: unknown;
  Prefs: ReturnType<typeof createMockPrefs>;
  locale: string;
};

type TestGlobal = {
  Zotero: TestZotero;
  Services: typeof Services & {
    locale: { appLocaleAsBCP47: string };
  };
  ChromeUtils: typeof ChromeUtils;
  __menuManagerRegisterCalls: typeof menuManagerRegisterCalls;
  __menuManagerUnregisterCalls: typeof menuManagerUnregisterCalls;
  __resetMenuManagerMocks: () => void;
  __resetHTTPMock: () => void;
  __setHTTPMock: (mock: unknown) => void;
};

const testGlobal = globalThis as unknown as TestGlobal;

function isLiveAPIMode(): boolean {
  return process.env.LIVE_API_TESTS === "1";
}

function resetItemAccessors(): void {
  testGlobal.Zotero.Items.get = (id: number) => getMockItemById(id);
  testGlobal.Zotero.Items.getAll = () => getAllMockItems();
  testGlobal.Zotero.Items.trash = async (ids: number | number[]) =>
    trashMockItems(ids);
}

function installDefaultAttachmentAdapters(): void {
  testGlobal.Zotero.Attachments.importFromURL = async () => null;
  testGlobal.Zotero.Attachments.importFromFile = async () => null;
  testGlobal.Zotero.Attachments.importFromBuffer = async () => null;
}

testGlobal.__menuManagerRegisterCalls = menuManagerRegisterCalls;
testGlobal.__menuManagerUnregisterCalls = menuManagerUnregisterCalls;
testGlobal.__resetMenuManagerMocks = resetMenuManagerMocks;

// Mock Zotero object
testGlobal.Zotero = {
  log: console.log,
  initializationPromise: Promise.resolve(),
  unlockPromise: Promise.resolve(),
  uiReadyPromise: Promise.resolve(),
  locale: "en-US",
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
      responseText: "{}",
      response: "{}",
      getResponseHeader: () => null,
    }),
  },
  ItemTypes: {
    getName: (id: number) => ITEM_TYPE_NAMES[id] ?? "journalArticle",
    getID: (name: string) => ITEM_TYPE_IDS[name] ?? 1,
  },
  CreatorTypes: {
    getID: (name: string) => (name === "author" ? 8 : 0),
    getPrimaryIDForType: () => 8,
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
    registerObserver: () => "test-id",
    unregisterObserver: () => {},
  },
  Utilities: {
    cleanURL: (url: string) => url,
    cleanDOI: (doi: string) =>
      doi
        .replace(/^https?:\/\/(?:dx\.)?doi\.org\//i, "")
        .replace(/^doi:\s*/i, "")
        .trim(),
    cleanISBN: (isbn: string) => isbn,
  },
} as unknown as TestZotero;

// Mock Services global (auto-imported in Firefox 128+)
testGlobal.Services = {
  locale: {
    appLocaleAsBCP47: "en-US",
  },
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
} as unknown as TestGlobal["Services"];

// Mock ChromeUtils
testGlobal.ChromeUtils = {
  defineLazyGetter: (obj: object, name: string, getter: () => unknown) => {
    Object.defineProperty(obj, name, { get: getter });
  },
  defineESModuleGetters: () => {},
};

// Mock document.createXULElement for DOM tests
if (typeof document !== "undefined") {
  document.createXULElement = document.createElement.bind(document);
}

// Extend Zotero mock with test utilities
testGlobal.Zotero.Prefs = createMockPrefs();

// Helper to reset HTTP mock with fixtures
testGlobal.__resetHTTPMock = () => {
  testGlobal.Zotero.HTTP = isLiveAPIMode()
    ? createLiveHTTP()
    : createMockHTTP();
};

// Helper to set custom HTTP mock
testGlobal.__setHTTPMock = (mock: unknown) => {
  testGlobal.Zotero.HTTP = mock;
};

// Reset mocks between tests
beforeEach(() => {
  testGlobal.__resetHTTPMock?.();
  testGlobal.__resetMenuManagerMocks?.();
  clearPrefs();
  resetMockCounters();
  resetItemAccessors();
  testGlobal.Zotero.locale = "en-US";
  testGlobal.Services.locale.appLocaleAsBCP47 = "en-US";
  if (isLiveAPIMode()) {
    installLiveAttachmentAdapters();
  } else {
    installDefaultAttachmentAdapters();
  }
});
