// tests/__mocks__/zotero-items.ts
import { vi } from 'vitest';

export interface MockItemConfig {
  id?: number;
  itemTypeID?: number;
  title?: string;
  DOI?: string;
  ISBN?: string;
  url?: string;
  extra?: string;
  publicationTitle?: string;
  date?: string;
  creators?: Array<{ firstName?: string; lastName?: string }>;
}

let itemCounter = 0;

export function createMockItem(config: MockItemConfig = {}) {
  const id = config.id ?? ++itemCounter;
  const fields: Record<string, string> = {
    title: config.title ?? 'Test Title',
    DOI: config.DOI ?? '',
    ISBN: config.ISBN ?? '',
    url: config.url ?? '',
    extra: config.extra ?? '',
    publicationTitle: config.publicationTitle ?? '',
    date: config.date ?? '',
  };

  const creators = config.creators ?? [];
  const tags: Array<{ tag: string; type: number }> = [];

  return {
    id,
    itemTypeID: config.itemTypeID ?? 1,

    getField: vi.fn((fieldName: string) => fields[fieldName] ?? ''),
    setField: vi.fn((fieldName: string, value: string) => {
      fields[fieldName] = value;
    }),

    getCreators: vi.fn(() => creators),
    setCreators: vi.fn((newCreators: any[]) => {
      creators.length = 0;
      creators.push(...newCreators);
    }),
    setCreator: vi.fn((index: number, creator: any) => {
      creators[index] = creator;
    }),
    numCreators: () => creators.length,
    getAttachments: vi.fn(() => []),

    hasTag: vi.fn((tagName: string) => tags.some(t => t.tag === tagName)),
    addTag: vi.fn((tag: string, type: number = 0) => {
      tags.push({ tag, type });
    }),

    saveTx: vi.fn(async () => id),
    eraseTx: vi.fn(async () => {}),
    setType: vi.fn(() => {}),
  } as any;
}

export interface MockAttachmentConfig {
  id?: number;
  linkMode?: number;
  filePath?: string | null;
  fileExists?: boolean;
}

let attachmentCounter = 0;

export function resetMockCounters() {
  itemCounter = 0;
  attachmentCounter = 0;
}

export function createMockAttachment(config: MockAttachmentConfig = {}) {
  const id = config.id ?? ++attachmentCounter;
  const filePath = config.filePath;
  const fileExists = config.fileExists ?? (filePath !== null && filePath !== undefined);

  return {
    id,
    attachmentLinkMode: config.linkMode ?? 2,
    getFilePath: vi.fn(() => filePath ?? null),
    getFile: vi.fn(() => fileExists ? { exists: () => true } : null),
    eraseTx: vi.fn(async () => {}),
  } as any;
}