// tests/helpers/test-utils.ts
// Shared test utilities for zotadata tests

import { vi } from 'vitest';
import { createMockHTTP, clearFixtures } from '../__mocks__/zotero-http';

/**
 * Item type IDs used by Zotero
 */
export const ItemTypeID = {
  JOURNAL_ARTICLE: 1,
  BOOK: 2,
  CONFERENCE_PAPER: 3,
  PREPRINT: 4,
} as const;

/**
 * Attachment link modes
 */
export const LinkMode = {
  LINKED_URL: 1,
  IMPORTED_FILE: 2,
  LINKED_FILE: 3,
} as const;

export interface ZoteroMockConfig {
  /** Include HTTP mock */
  http?: boolean;
  /** Include Utilities mock */
  utilities?: boolean;
  /** Include Date mock */
  date?: boolean;
  /** Include ItemTypes mock */
  itemTypes?: boolean;
  /** Custom HTTP mock */
  httpMock?: ReturnType<typeof createMockHTTP>;
}

/**
 * Set up Zotero global mock for tests
 * Reduces duplication across test files
 */
export function setupZoteroMock(config: ZoteroMockConfig = {}) {
  const {
    http = true,
    utilities = true,
    date = true,
    itemTypes = false,
    httpMock,
  } = config;

  const mockHTTP = httpMock ?? (http ? createMockHTTP() : undefined);

  const mockZotero: Record<string, unknown> = {};

  if (mockHTTP) {
    mockZotero.HTTP = mockHTTP;
  }

  if (utilities) {
    mockZotero.Utilities = {
      cleanDOI: (d: string) => (d ? d.trim().toLowerCase() : d),
      cleanISBN: (i: string) => i,
      cleanURL: (u: string) => u,
    };
  }

  if (date) {
    mockZotero.Date = {
      strToDate: (d: string) => ({ year: d?.match(/\d{4}/)?.[0] }),
    };
  }

  if (itemTypes) {
    mockZotero.ItemTypes = {
      getID: (type: string) => {
        const types: Record<string, number> = {
          journalArticle: ItemTypeID.JOURNAL_ARTICLE,
          book: ItemTypeID.BOOK,
          conferencePaper: ItemTypeID.CONFERENCE_PAPER,
          preprint: ItemTypeID.PREPRINT,
        };
        return types[type] ?? null;
      },
      getName: (id: number) => {
        const names: Record<number, string> = {
          [ItemTypeID.JOURNAL_ARTICLE]: 'journalArticle',
          [ItemTypeID.BOOK]: 'book',
          [ItemTypeID.CONFERENCE_PAPER]: 'conferencePaper',
          [ItemTypeID.PREPRINT]: 'preprint',
        };
        return names[id] ?? null;
      },
    };
  }

  (globalThis as any).Zotero = mockZotero;

  return { mockHTTP };
}

/**
 * Common beforeEach setup for zotadata tests
 */
export function zotadataTestSetup() {
  clearFixtures();
  return setupZoteroMock();
}