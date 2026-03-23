// tests/__mocks__/zotero-prefs.ts
import { vi } from 'vitest';

const prefs: Map<string, any> = new Map();

export function createMockPrefs() {
  return {
    get: vi.fn((key: string, defaultValue?: any) => {
      return prefs.has(key) ? prefs.get(key) : defaultValue;
    }),
    set: vi.fn((key: string, value: any) => {
      prefs.set(key, value);
    }),
    clear: vi.fn((key: string) => {
      prefs.delete(key);
    }),
  };
}

export function setPref(key: string, value: any) {
  prefs.set(key, value);
}

export function clearPrefs() {
  prefs.clear();
}