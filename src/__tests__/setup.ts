// src/__tests__/setup.ts
// Mock Zotero 8 globals for testing

// Mock Zotero object
(globalThis as any).Zotero = {
  log: console.log,
  getMainWindows: () => [],
  getActiveZoteroPane: () => null,
  platformMajorVersion: 140,
  Items: {
    get: () => null,
    getAll: () => [],
  },
  Attachments: {
    LINK_MODE_LINKED_URL: 1,
    LINK_MODE_IMPORTED_FILE: 2,
    LINK_MODE_LINKED_FILE: 3,
    importFromURL: async () => null,
    importFromFile: async () => null,
  },
  HTTP: {
    request: async () => ({
      status: 200,
      responseText: '{}',
      getResponseHeader: () => null,
    }),
  },
  // Zotero 8 Menu API mock
  MenuManager: {
    registerMenu: () => () => {},
    unregisterMenu: () => {},
  },
  Notifier: {
    registerObserver: () => 'test-id',
    unregisterObserver: () => {},
  },
  Utilities: {
    cleanURL: (url: string) => url,
    cleanDOI: (doi: string) => doi,
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

// Import mock utilities for tests
import { createMockHTTP } from '../../tests/__mocks__/zotero-http';
import { createMockPrefs, clearPrefs } from '../../tests/__mocks__/zotero-prefs';
import { resetMockCounters } from '../../tests/__mocks__/zotero-items';

// Extend Zotero mock with test utilities
(globalThis as any).Zotero.Prefs = createMockPrefs();

// Helper to reset HTTP mock with fixtures
(globalThis as any).__resetHTTPMock = () => {
  (globalThis as any).Zotero.HTTP = createMockHTTP();
};

// Helper to set custom HTTP mock
(globalThis as any).__setHTTPMock = (mock: any) => {
  (globalThis as any).Zotero.HTTP = mock;
};

// Reset mocks between tests
beforeEach(() => {
  (globalThis as any).__resetHTTPMock?.();
  clearPrefs();
  resetMockCounters();
});