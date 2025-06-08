// Test setup for Vitest
import { vi } from 'vitest';

// Mock Zotero global
const mockZotero = {
  log: vi.fn(),
  getMainWindows: vi.fn(() => []),
  getActiveZoteroPane: vi.fn(() => ({
    getSelectedItems: vi.fn(() => []),
    getSelectedCollection: vi.fn(() => null),
  })),
  platformMajorVersion: 102,
  Items: {
    get: vi.fn(),
    getAll: vi.fn(() => []),
  },
  Collections: {
    get: vi.fn(),
    getAll: vi.fn(() => []),
  },
  Attachments: {
    importFromURL: vi.fn(),
    importFromFile: vi.fn(),
  },
  HTTP: {
    request: vi.fn(),
  },
  Utilities: {
    cleanURL: vi.fn((url: string) => url),
    cleanDOI: vi.fn((doi: string) => doi),
    cleanISBN: vi.fn((isbn: string) => isbn),
  },
};

// Set up global mocks
global.Zotero = mockZotero;
global.Components = {};
global.Services = {};
global.ChromeUtils = {};

// Mock DOM APIs
Object.defineProperty(window, 'alert', {
  value: vi.fn(),
  writable: true,
});

// Mock navigator
Object.defineProperty(window, 'navigator', {
  value: {
    userAgent: 'Test User Agent',
  },
  writable: true,
});

// Export mocks for use in tests
export { mockZotero }; 