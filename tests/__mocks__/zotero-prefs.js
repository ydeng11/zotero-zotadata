// tests/__mocks__/zotero-prefs.ts
import { vi } from 'vitest';
const prefs = new Map();
export function createMockPrefs() {
    return {
        get: vi.fn((key, defaultValue) => {
            return prefs.has(key) ? prefs.get(key) : defaultValue;
        }),
        set: vi.fn((key, value) => {
            prefs.set(key, value);
        }),
        clear: vi.fn((key) => {
            prefs.delete(key);
        }),
    };
}
export function setPref(key, value) {
    prefs.set(key, value);
}
export function clearPrefs() {
    prefs.clear();
}
