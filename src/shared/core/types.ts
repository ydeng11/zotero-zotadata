// Core type definitions for Zotadata

export interface AddonData {
  id: string;
  version: string;
  rootURI: string;
}

export interface AttachmentStats {
  valid: number;
  removed: number;
  weblinks: number;
  errors: number;
  processed?: number;
}

export interface MetadataResult {
  success: boolean;
  item: Zotero.Item;
  source: string;
  changes: string[];
  errors: string[];
}

export interface DownloadOptions {
  timeout?: number;
  headers?: Record<string, string>;
  responseType?: 'text' | 'json' | 'arraybuffer';
  validateSize?: boolean;
  maxFileSize?: number;
}

export interface DownloadResult {
  success: boolean;
  url: string;
  source: string;
  fileSize: number;
  data?: ArrayBuffer;
  error?: string;
}

export interface APIResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
  cached: boolean;
  timestamp: string;
}

export interface RateLimitConfig {
  requests: number;
  window: number; // milliseconds
}

export interface CacheConfig {
  ttl: number; // milliseconds
  maxSize: number;
}

// Re-export ErrorType from ErrorTypes for backward compatibility
export { ErrorType } from './errors/ErrorTypes';
import type { ErrorType } from './errors/ErrorTypes';

/** Runtime errors produced by ErrorManager / AppError (extends Error). */
export interface ContextualError extends Error {
  type: ErrorType;
  context: Record<string, unknown>;
  timestamp: string;
  retryable: boolean;
  cause?: Error;
}

// Batch processing result
export interface BatchResult<T = unknown> {
  success: boolean;
  results: Array<{ success: boolean; result?: T; error?: Error }>;
  errors: Array<{ success: boolean; error: Error }>;
  totalProcessed: number;
  successCount: number;
  errorCount: number;
  successRate: number;
}

// Metadata fetch result
export interface MetadataFetchResult {
  success: boolean;
  updated: boolean;
  error?: string;
}

/** Per-item result for arXiv batch processing (drives summary copy). */
export type ArxivProcessOutcome =
  | 'updated_published'
  | 'converted_preprint'
  | 'unchanged'
  | 'skipped_not_arxiv'
  | 'failed_metadata'
  | 'failed_exception';

// arXiv processing result
export interface ArxivProcessResult {
  processed: boolean;
  converted: boolean;
  foundPublished: boolean;
  outcome: ArxivProcessOutcome;
}

// File retrieval result
export interface FileRetrievalResult {
  url: string | null;
  source: string | null;
}

export interface SearchQuery {
  title?: string;
  authors?: string[];
  year?: number;
  doi?: string;
  isbn?: string;
  arxivId?: string;
}

export interface SearchResult {
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  url?: string;
  pdfUrl?: string;
  confidence: number;
  source: string;
}

export interface PublishedVersionInfo {
  doi: string;
  title: string;
  authors: string[];
  year: number;
  journal?: string;
  volume?: string;
  issue?: string;
  pages?: string;
  pdfUrl?: string;
  confidence: number;
}

export interface BookMetadata {
  title: string;
  authors: string[];
  isbn?: string;
  publisher?: string;
  year?: number;
  pages?: number;
  language?: string;
  subjects?: string[];
}

export interface ProgressInfo {
  current: number;
  total: number;
  message: string;
  cancellable: boolean;
}

export type AttachmentType = 'pdf' | 'html' | 'epub' | 'other';

export interface AttachmentInfo {
  type: AttachmentType;
  url: string;
  title: string;
  source: string;
  confidence: number;
}

// API-specific types
export interface CrossRefWork {
  type?: string;
  DOI: string;
  title: string[];
  'original-title'?: string[];
  language?: string;
  author?: Array<{
    given?: string;
    family: string;
  }>;
  published?: {
    'date-parts': number[][];
  };
  'container-title'?: string[];
  volume?: string;
  issue?: string;
  page?: string;
  URL?: string;
}

export interface OpenAlexWork {
  id: string;
  doi?: string;
  title: string;
  display_name: string;
  authorships: Array<{
    author: {
      display_name: string;
    };
  }>;
  publication_year?: number;
  primary_location?: {
    source?: {
      display_name: string;
    };
  };
  open_access?: {
    is_oa: boolean;
    oa_url?: string;
  };
}

export interface SemanticScholarPaper {
  paperId: string;
  title: string;
  authors: Array<{
    name: string;
  }>;
  year?: number;
  venue?: string;
  doi?: string;
  externalIds?: {
    DOI?: string;
    ArXiv?: string;
    CorpusId?: string;
  };
  url?: string;
  openAccessPdf?: {
    url: string;
  };
}

export interface ArxivEntry {
  id: string;
  title: string;
  authors: Array<{
    name: string;
  }>;
  published: string;
  summary: string;
  doi?: string;
  'journal-ref'?: string;
  categories: string[];
  pdf_url: string;
}

export interface PMCEntry {
  pmid?: string;
  pmcid?: string;
  title: string;
  authors: string[];
  journal?: string;
  pubdate?: string;
  doi?: string;
  abstract?: string;
  keywords?: string[];
}

// Configuration interfaces
export interface PluginConfig {
  maxConcurrentDownloads: number;
  maxFileSize: number;
  downloadTimeout: number;
  enabledAPIs: string[];
  rateLimits: Record<string, RateLimitConfig>;
  cacheSettings: CacheConfig;
  userAgent: string;
}

export interface UIConfig {
  showProgressDialog: boolean;
  showSuccessNotifications: boolean;
  showErrorDetails: boolean;
  confirmBeforeDownload: boolean;
}

// Utility types
export type ItemType = 'journalArticle' | 'book' | 'bookSection' | 'conferencePaper' | 'preprint' | 'thesis' | 'report' | 'other';

export interface ItemInfo {
  id: number;
  type: ItemType;
  title: string;
  creators: Array<{
    firstName?: string;
    lastName: string;
    creatorType: string;
  }>;
  year?: number;
  doi?: string;
  isbn?: string;
  url?: string;
  extra?: string;
}

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: string;
  context?: Record<string, any>;
}

// Resource management
export interface Resource {
  cleanup(): Promise<void> | void;
}

export interface ResourceManager {
  track<T extends Resource>(resource: T): T;
  cleanup(): Promise<void>;
}

// Queue management
export interface QueueItem<T> {
  id: string;
  data: T;
  priority: number;
  retries: number;
  maxRetries: number;
  createdAt: string;
}

export interface QueueConfig {
  concurrency: number;
  retryDelay: number;
  maxRetries: number;
}

// Event system
export type EventType =
  | 'download:start'
  | 'download:progress'
  | 'download:complete'
  | 'download:error'
  | 'metadata:found'
  | 'metadata:updated'
  | 'attachment:created'
  | 'attachment:removed'
  | 'error:occurred';

export interface EventData {
  type: EventType;
  payload: any;
  timestamp: string;
  source: string;
}

export interface EventListener<T = any> {
  (data: EventData & { payload: T }): void | Promise<void>;
}

// Plugin lifecycle
export interface PluginLifecycle {
  init(data: AddonData): Promise<void>;
  startup(): Promise<void>;
  shutdown(): Promise<void>;
  uninstall(): Promise<void>;
}

/** Per-item outcome for the "Find Missing Files" command. */
export type FileFinderOutcome =
  | 'downloaded'
  | 'already_has_file'
  | 'no_source_found'
  | 'download_failed'
  | 'skipped_not_regular';

export interface FileFinderResult {
  item: Zotero.Item;
  outcome: FileFinderOutcome;
  source?: string;
  pdfUrl?: string;
  error?: string;
}

// Alias for backward compatibility
export interface AttachmentFinderConfig extends PluginConfig {
  downloads?: {
    maxConcurrent: number;
    maxFileSize?: number;
    timeout?: number;
  };
}
