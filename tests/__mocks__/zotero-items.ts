import { vi } from "vitest";

export interface MockCreator {
  firstName?: string;
  lastName: string;
  creatorType?: string;
  name?: string;
}

export interface MockItemConfig {
  id?: number;
  libraryID?: number;
  itemTypeID?: number;
  title?: string;
  DOI?: string;
  ISBN?: string;
  url?: string;
  extra?: string;
  publicationTitle?: string;
  proceedingsTitle?: string;
  repository?: string;
  date?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  abstractNote?: string;
  note?: string;
  parentID?: number;
  attachmentIds?: number[];
  creators?: MockCreator[];
  tags?: Array<{ tag: string; type: number }>;
  isAttachment?: boolean;
  isRegularItem?: boolean;
}

export interface MockAttachmentConfig extends MockItemConfig {
  linkMode?: number;
  filePath?: string | null;
  fileExists?: boolean;
  contentType?: string;
  title?: string;
  url?: string;
}

type MockTag = { tag: string; type: number };

type MockZoteroItem = Zotero.Item & {
  __mockAttachmentIds: number[];
  __mockCreators: MockCreator[];
  __mockFields: Record<string, string>;
  __mockFileExists: boolean;
  __mockFilePath: string | null;
  __mockNote: string;
  __mockTags: MockTag[];
  __mockTrashed?: boolean;
  eraseTx: ReturnType<typeof vi.fn>;
  hasTag: ReturnType<typeof vi.fn>;
  numCreators: ReturnType<typeof vi.fn>;
  removeTag: ReturnType<typeof vi.fn>;
  setCreator: ReturnType<typeof vi.fn>;
};

const ITEM_FIELDS = [
  "DOI",
  "ISBN",
  "abstractNote",
  "date",
  "extra",
  "issue",
  "pages",
  "proceedingsTitle",
  "publicationTitle",
  "repository",
  "title",
  "url",
  "volume",
] as const;

const itemRegistry = new Map<number, Zotero.Item>();
let itemCounter = 0;
let attachmentCounter = 1000;

function normalizeCreators(creators: MockCreator[] = []): MockCreator[] {
  return creators.map((creator) => ({
    ...creator,
    creatorType: creator.creatorType ?? "author",
  }));
}

function sanitizeFilePath(
  filePath: string | null | undefined,
  id: number,
): string | null {
  if (filePath === undefined) {
    return `/tmp/mock-${id}.pdf`;
  }

  return filePath;
}

function getMockItemFields(item: Zotero.Item): Record<string, string> {
  return (item as MockZoteroItem).__mockFields;
}

function addAttachmentToParent(
  parentID: number | undefined,
  attachmentID: number,
): void {
  if (!parentID) {
    return;
  }

  const parent = getMockItemById(parentID) as MockZoteroItem | null;
  if (!parent) {
    return;
  }

  if (!parent.__mockAttachmentIds.includes(attachmentID)) {
    parent.__mockAttachmentIds.push(attachmentID);
  }
}

function removeAttachmentFromParent(
  parentID: number | undefined,
  attachmentID: number,
): void {
  if (!parentID) {
    return;
  }

  const parent = getMockItemById(parentID) as MockZoteroItem | null;
  if (!parent) {
    return;
  }

  parent.__mockAttachmentIds = parent.__mockAttachmentIds.filter(
    (id) => id !== attachmentID,
  );
}

function createBaseItem(config: MockItemConfig = {}): MockZoteroItem {
  const id = config.id ?? ++itemCounter;
  const fields = Object.fromEntries(
    ITEM_FIELDS.map((field) => {
      if (field === "title") {
        return [field, String(config.title ?? "Test Title")];
      }

      return [field, String(config[field] ?? "")];
    }),
  ) as Record<string, string>;
  const creators = normalizeCreators(config.creators);
  const tags = [...(config.tags ?? [])];
  const attachmentIds = [...(config.attachmentIds ?? [])];
  const filePath = sanitizeFilePath(undefined, id);

  const item = {
    id,
    libraryID: config.libraryID ?? 1,
    itemTypeID: config.itemTypeID ?? 1,
    parentID: config.parentID ?? 0,
    attachmentLinkMode: 0,
    attachmentContentType: "",
    __mockAttachmentIds: attachmentIds,
    __mockCreators: creators,
    __mockFields: fields,
    __mockFileExists: true,
    __mockFilePath: filePath,
    __mockNote: config.note ?? "",
    __mockTags: tags,

    getField: vi.fn((fieldName: string) => fields[fieldName] ?? ""),
    setField: vi.fn((fieldName: string, value: string) => {
      fields[fieldName] = String(value ?? "");
    }),
    setType: vi.fn((typeID: number) => {
      item.itemTypeID = typeID;
    }),
    addTag: vi.fn((tag: string, type = 0) => {
      if (
        !tags.some((existing) => existing.tag === tag && existing.type === type)
      ) {
        tags.push({ tag, type });
      }
    }),
    removeTag: vi.fn((tag: string) => {
      const originalLength = tags.length;
      const remaining = tags.filter((existing) => existing.tag !== tag);
      tags.splice(0, tags.length, ...remaining);
      return remaining.length !== originalLength;
    }),
    hasTag: vi.fn((tag: string) =>
      tags.some((existing) => existing.tag === tag),
    ),

    save: vi.fn(async () => {}),
    saveTx: vi.fn(async () => {}),
    eraseTx: vi.fn(async () => {
      itemRegistry.delete(item.id);
      removeAttachmentFromParent(item.parentID, item.id);
    }),

    isRegularItem: vi.fn(() => config.isRegularItem ?? !config.isAttachment),
    isTopLevelItem: vi.fn(() => item.parentID === 0),
    isAttachment: vi.fn(() => config.isAttachment ?? false),
    isNote: vi.fn(() => false),
    getSource: vi.fn(() => (item.parentID ? item.parentID : null)),

    getCreators: vi.fn(() => creators.map((creator) => ({ ...creator }))),
    setCreators: vi.fn((newCreators: MockCreator[]) => {
      creators.splice(0, creators.length, ...normalizeCreators(newCreators));
    }),
    setCreator: vi.fn((index: number, creator: MockCreator) => {
      creators[index] = {
        ...creator,
        creatorType: creator.creatorType ?? "author",
      };
    }),
    numCreators: vi.fn(() => creators.length),

    getAttachments: vi.fn(() => attachmentIds.slice()),
    addAttachment: vi.fn(
      async (options: {
        url?: string;
        path?: string;
        title?: string;
        contentType?: string;
      }) => {
        const attachment = createMockZoteroAttachment({
          parentID: item.id,
          title: options.title ?? fields.title,
          url: options.url,
          filePath: options.path ?? undefined,
          contentType: options.contentType ?? "application/pdf",
          linkMode: 0,
          fileExists: true,
        });
        return attachment.id;
      },
    ),

    getFilePath: vi.fn(() => item.__mockFilePath || false),
    getFile: vi.fn(() =>
      item.__mockFilePath
        ? {
            exists: () => item.__mockFileExists,
          }
        : null,
    ),
    fileExists: vi.fn(async () => item.__mockFileExists),
    isEditable: vi.fn(() => true),
    isPDFAttachment: vi.fn(
      () =>
        item.isAttachment() &&
        item.attachmentContentType.toLowerCase() === "application/pdf",
    ),
    setNote: vi.fn((note: string) => {
      item.__mockNote = note;
    }),
  } as unknown as MockZoteroItem;

  itemRegistry.set(id, item);
  return item;
}

export function createMockZoteroItem(config: MockItemConfig = {}): Zotero.Item {
  return createBaseItem(config);
}

export function createMockZoteroAttachment(
  config: MockAttachmentConfig = {},
): Zotero.Item {
  const id = config.id ?? ++attachmentCounter;
  const attachment = createBaseItem({
    ...config,
    id,
    isAttachment: true,
    isRegularItem: false,
    title: config.title ?? "Attachment",
  }) as MockZoteroItem;

  attachment.attachmentLinkMode = config.linkMode ?? 2;
  attachment.attachmentContentType = config.contentType ?? "application/pdf";
  attachment.parentID = config.parentID ?? 0;
  attachment.__mockFilePath = sanitizeFilePath(config.filePath, id);
  attachment.__mockFileExists =
    config.fileExists ?? attachment.__mockFilePath !== null;

  const fields = getMockItemFields(attachment);
  if (config.title !== undefined) {
    fields.title = config.title;
  }
  if (config.url !== undefined) {
    fields.url = config.url;
  }

  itemRegistry.set(id, attachment);
  addAttachmentToParent(attachment.parentID, id);
  return attachment;
}

export const createMockItem = createMockZoteroItem;
export const createMockAttachment = createMockZoteroAttachment;

export function getMockItemById(id: number): Zotero.Item | null {
  return itemRegistry.get(id) ?? null;
}

export function getAllMockItems(): Zotero.Item[] {
  return [...itemRegistry.values()];
}

export async function trashMockItems(ids: number | number[]): Promise<void> {
  const idsToTrash = Array.isArray(ids) ? ids : [ids];

  for (const id of idsToTrash) {
    const item = getMockItemById(id) as MockZoteroItem | null;
    if (!item) {
      continue;
    }

    item.__mockTrashed = true;
    itemRegistry.delete(id);
    removeAttachmentFromParent(item.parentID, id);
  }
}

function sanitizeAttachmentFileName(
  fileName: string | undefined,
  fallbackId: number,
): string {
  const baseName = (fileName ?? `attachment-${fallbackId}.pdf`).replace(
    /\s+/g,
    "-",
  );
  return baseName.endsWith(".pdf") ? baseName : `${baseName}.pdf`;
}

function isPdfLike(data: Uint8Array): boolean {
  if (data.length < 5) {
    return false;
  }

  const header = new TextDecoder("ascii", { fatal: false }).decode(
    data.slice(0, 8),
  );
  return header.startsWith("%PDF-");
}

function toUint8Array(data: ArrayBuffer | Uint8Array): Uint8Array {
  return data instanceof Uint8Array ? data : new Uint8Array(data);
}

async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/pdf,*/*",
      "User-Agent": "Zotero Zotadata Live Tests",
    },
  });

  if (!response.ok) {
    throw new Error(`PDF fetch failed with HTTP ${response.status}`);
  }

  return new Uint8Array(await response.arrayBuffer());
}

export function installLiveAttachmentAdapters(): void {
  const zotero = globalThis.Zotero as typeof Zotero & {
    Attachments: typeof Zotero.Attachments & {
      LINK_MODE_IMPORTED_URL?: number;
    };
  };

  zotero.Attachments.importFromURL = async (options) => {
    const bytes = await fetchPdfBytes(options.url);
    if (!isPdfLike(bytes)) {
      throw new Error("Downloaded file is not a valid PDF");
    }

    const attachment = createMockZoteroAttachment({
      parentID: options.parentItemID,
      libraryID: options.libraryID,
      title: options.title ?? options.fileBaseName ?? "Downloaded PDF",
      contentType: options.contentType ?? "application/pdf",
      filePath: `/live/${sanitizeAttachmentFileName(options.fileBaseName ?? options.title, attachmentCounter + 1)}`,
      fileExists: true,
      linkMode:
        zotero.Attachments.LINK_MODE_IMPORTED_FILE ??
        zotero.Attachments.LINK_MODE_IMPORTED_URL ??
        0,
    }) as MockZoteroItem;

    attachment.setField("url", options.url);
    return attachment;
  };

  zotero.Attachments.importFromBuffer = async (options) => {
    const bytes = toUint8Array(options.buffer);
    if (!isPdfLike(bytes)) {
      throw new Error("Buffered file is not a valid PDF");
    }

    return createMockZoteroAttachment({
      parentID: options.parentItemID,
      title: options.fileName.replace(/\.pdf$/i, ""),
      contentType: options.contentType,
      filePath: `/buffer/${sanitizeAttachmentFileName(options.fileName, attachmentCounter + 1)}`,
      fileExists: true,
      linkMode: zotero.Attachments.LINK_MODE_IMPORTED_FILE ?? 0,
    });
  };

  zotero.Attachments.importFromFile = async (options) =>
    createMockZoteroAttachment({
      parentID: options.parentItemID,
      title: options.title ?? "Imported File",
      contentType: "application/pdf",
      filePath:
        typeof options.file?.path === "string"
          ? options.file.path
          : `/file/${sanitizeAttachmentFileName(options.title, attachmentCounter + 1)}`,
      fileExists: true,
      linkMode: zotero.Attachments.LINK_MODE_IMPORTED_FILE ?? 0,
    });
}

export function resetMockCounters(): void {
  itemCounter = 0;
  attachmentCounter = 1000;
  itemRegistry.clear();
}
