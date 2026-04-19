export interface DOIDiscoveryOptions {
  ignoreExistingDoi?: boolean;
  publishedOnly?: boolean;
}

export interface LegacyFetchResult {
  success: boolean;
  updated: boolean;
  error: string | null;
  source: string;
  changes: string[];
}

export interface TranslatorItem {
  deleted?: boolean;
  getCreators(): Array<{
    creatorType?: string;
    firstName?: string;
    lastName?: string;
  }>;
  getField(field: string): string;
  saveTx(): Promise<void>;
}

export interface TranslatorSearch {
  getTranslators(): Promise<unknown[]>;
  setIdentifier(identifier: Record<string, unknown>): void;
  setTranslator(translators: unknown[]): void;
  translate(): Promise<TranslatorItem[]>;
}

export interface OpenLibraryBookMetadata {
  authors?: Array<{ name?: string } | string>;
  number_of_pages?: number;
  publish_date?: string;
  publishers?: string[];
  title?: string;
}

export interface GoogleBooksVolumeInfo {
  authors?: string[];
  pageCount?: number;
  publishedDate?: string;
  publisher?: string;
  title?: string;
}

export type BookMetadataSource =
  | { source: "Zotero Translator"; success: true }
  | OpenLibraryBookMetadata
  | GoogleBooksVolumeInfo;

export const BOOK_TRANSLATOR_FIELDS = [
  "title",
  "publisher",
  "place",
  "edition",
  "date",
  "numPages",
  "url",
  "abstractNote",
] as const;

export const DOI_TRANSLATOR_FIELDS = [
  "title",
  "publicationTitle",
  "volume",
  "issue",
  "pages",
  "date",
  "url",
  "abstractNote",
] as const;

export interface FetchOptions {
  strategy?: "parallel" | "fallback" | "best_result";
  minConfidence?: number;
  maxResults?: number;
  includeOpenAccess?: boolean;
  downloadPDFs?: boolean;
  apis?: string[];
}

export interface MetadataSearchResult {
  results: import("@/shared/core/types").SearchResult[];
  source: string;
  query: import("@/shared/core/types").SearchQuery;
  confidence: number;
  searchTime: number;
}
