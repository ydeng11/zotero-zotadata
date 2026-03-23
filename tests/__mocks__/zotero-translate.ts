// tests/__mocks__/zotero-translate.ts
import { vi } from 'vitest';

export interface MockTranslatorConfig {
  found?: boolean;
  item?: {
    title?: string;
    creators?: Array<{ firstName: string; lastName: string }>;
    [key: string]: any;
  };
}

export function createMockTranslate(config: MockTranslatorConfig = {}) {
  return vi.fn().mockImplementation(() => ({
    setSearch: vi.fn(),
    setHandler: vi.fn((_type: string, callback: (items: any[]) => void) => {
      if (config.found && config.item) {
        setTimeout(() => callback([config.item]), 0);
      } else {
        setTimeout(() => callback([]), 0);
      }
    }),
    translate: vi.fn(),
  }));
}

export function setupTranslateMock(config?: MockTranslatorConfig) {
  const mock = createMockTranslate(config);
  (globalThis as any).Zotero.Translate = {
    Search: mock,
  };
  return mock;
}