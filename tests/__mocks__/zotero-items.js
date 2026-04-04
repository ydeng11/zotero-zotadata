// tests/__mocks__/zotero-items.ts
import { vi } from 'vitest';
let itemCounter = 0;
export function createMockItem(config = {}) {
    const id = config.id ?? ++itemCounter;
    const fields = {
        title: config.title ?? 'Test Title',
        DOI: config.DOI ?? '',
        ISBN: config.ISBN ?? '',
        url: config.url ?? '',
        extra: config.extra ?? '',
        publicationTitle: config.publicationTitle ?? '',
        date: config.date ?? '',
    };
    const creators = config.creators ?? [];
    const tags = [];
    return {
        id,
        itemTypeID: config.itemTypeID ?? 1,
        get id() { return id; },
        getField: vi.fn((fieldName) => fields[fieldName] ?? ''),
        setField: vi.fn((fieldName, value) => {
            fields[fieldName] = value;
        }),
        getCreators: vi.fn(() => creators),
        setCreators: vi.fn((newCreators) => {
            creators.length = 0;
            creators.push(...newCreators);
        }),
        setCreator: vi.fn((index, creator) => {
            creators[index] = creator;
        }),
        numCreators: () => creators.length,
        getAttachments: vi.fn(() => []),
        hasTag: vi.fn((tagName) => tags.some(t => t.tag === tagName)),
        addTag: vi.fn((tag, type = 0) => {
            tags.push({ tag, type });
        }),
        saveTx: vi.fn(async () => id),
        eraseTx: vi.fn(async () => { }),
        setType: vi.fn(() => { }),
    };
}
let attachmentCounter = 0;
export function resetMockCounters() {
    itemCounter = 0;
    attachmentCounter = 0;
}
export function createMockAttachment(config = {}) {
    const id = config.id ?? ++attachmentCounter;
    const filePath = config.filePath;
    const fileExists = config.fileExists ?? (filePath !== null && filePath !== undefined);
    return {
        id,
        attachmentLinkMode: config.linkMode ?? 2,
        getFilePath: vi.fn(() => filePath ?? null),
        getFile: vi.fn(() => fileExists ? { exists: () => true } : null),
        eraseTx: vi.fn(async () => { }),
    };
}
