import { ErrorManager, ErrorType } from '@/core';
import type { 
  DownloadOptions, 
  DownloadResult, 
  QueueItem, 
  QueueConfig,
  ProgressInfo,
  Resource 
} from '@/core/types';

/**
 * Download item for queue management
 */
interface DownloadQueueItem extends QueueItem<{
  url: string;
  options: DownloadOptions;
  itemId?: number;
  source: string;
}> {
  onProgress?: (progress: ProgressInfo) => void;
  onComplete?: (result: DownloadResult) => void;
  onError?: (error: Error) => void;
}

/**
 * Managed download with automatic cleanup
 */
class ManagedDownload implements Resource {
  private abortController: AbortController;
  private tempFiles: string[] = [];
  private blobUrls: string[] = [];

  constructor(
    public readonly id: string,
    public readonly url: string,
    public readonly options: DownloadOptions = {}
  ) {
    this.abortController = new AbortController();
  }

  /**
   * Get abort signal for fetch requests
   */
  getAbortSignal(): AbortSignal {
    return this.abortController.signal;
  }

  /**
   * Cancel the download
   */
  cancel(): void {
    this.abortController.abort();
  }

  /**
   * Track temporary file for cleanup
   */
  trackTempFile(filePath: string): void {
    this.tempFiles.push(filePath);
  }

  /**
   * Track blob URL for cleanup
   */
  trackBlobUrl(blobUrl: string): void {
    this.blobUrls.push(blobUrl);
  }

  /**
   * Clean up all resources
   */
  async cleanup(): Promise<void> {
    // Cancel any ongoing request
    this.cancel();

    // Revoke blob URLs
    for (const blobUrl of this.blobUrls) {
      try {
        URL.revokeObjectURL(blobUrl);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    // Clean up temporary files
    for (const filePath of this.tempFiles) {
      try {
        // Note: This would need proper file system access in Zotero
        // await fs.unlink(filePath);
      } catch (error) {
        // Ignore cleanup errors
      }
    }

    this.tempFiles = [];
    this.blobUrls = [];
  }
}

/**
 * Queue-based download manager with concurrency control and resource management
 */
export class DownloadManager {
  private errorManager: ErrorManager;
  private queue: DownloadQueueItem[] = [];
  private activeDownloads = new Map<string, ManagedDownload>();
  private config: QueueConfig;
  private isProcessing = false;
  private nextId = 1;

  // Statistics
  private stats = {
    completed: 0,
    failed: 0,
    cancelled: 0,
    totalBytes: 0,
  };

  constructor(config: Partial<QueueConfig> = {}) {
    this.errorManager = new ErrorManager();
    this.config = {
      concurrency: 3,
      retryDelay: 1000,
      maxRetries: 3,
      ...config,
    };
  }

  /**
   * Add download to queue
   */
  async queueDownload(
    url: string,
    options: DownloadOptions = {},
    callbacks: {
      onProgress?: (progress: ProgressInfo) => void;
      onComplete?: (result: DownloadResult) => void;
      onError?: (error: Error) => void;
    } = {}
  ): Promise<string> {
    const id = `download_${this.nextId++}`;
    
    const queueItem: DownloadQueueItem = {
      id,
      data: {
        url,
        options,
        source: 'queue',
      },
      priority: 1,
      retries: 0,
      maxRetries: this.config.maxRetries,
      createdAt: new Date().toISOString(),
      onProgress: callbacks.onProgress,
      onComplete: callbacks.onComplete,
      onError: callbacks.onError,
    };

    this.queue.push(queueItem);
    this.processQueue();

    return id;
  }

  /**
   * Download file immediately (bypasses queue)
   */
  async downloadFile(
    url: string,
    options: DownloadOptions = {}
  ): Promise<DownloadResult> {
    const id = `direct_${this.nextId++}`;
    const managedDownload = new ManagedDownload(id, url, options);
    
    try {
      this.activeDownloads.set(id, managedDownload);
      return await this.executeDownload(managedDownload);
    } finally {
      this.activeDownloads.delete(id);
      await managedDownload.cleanup();
    }
  }

  /**
   * Cancel download by ID
   */
  async cancelDownload(id: string): Promise<boolean> {
    // Cancel active download
    const activeDownload = this.activeDownloads.get(id);
    if (activeDownload) {
      activeDownload.cancel();
      this.activeDownloads.delete(id);
      await activeDownload.cleanup();
      this.stats.cancelled++;
      return true;
    }

    // Remove from queue
    const queueIndex = this.queue.findIndex(item => item.id === id);
    if (queueIndex >= 0) {
      this.queue.splice(queueIndex, 1);
      this.stats.cancelled++;
      return true;
    }

    return false;
  }

  /**
   * Cancel all downloads
   */
  async cancelAllDownloads(): Promise<void> {
    // Cancel active downloads
    const activePromises = Array.from(this.activeDownloads.values()).map(async (download) => {
      download.cancel();
      await download.cleanup();
    });
    
    await Promise.allSettled(activePromises);
    this.activeDownloads.clear();

    // Clear queue
    this.stats.cancelled += this.queue.length;
    this.queue = [];
  }

  /**
   * Get download statistics
   */
  getStats(): {
    active: number;
    queued: number;
    completed: number;
    failed: number;
    cancelled: number;
    totalBytes: number;
  } {
    return {
      active: this.activeDownloads.size,
      queued: this.queue.length,
      completed: this.stats.completed,
      failed: this.stats.failed,
      cancelled: this.stats.cancelled,
      totalBytes: this.stats.totalBytes,
    };
  }

  /**
   * Process download queue with concurrency control
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.queue.length > 0 && this.activeDownloads.size < this.config.concurrency) {
        const queueItem = this.queue.shift();
        if (!queueItem) break;

        // Start download in background
        this.processQueueItem(queueItem).catch(() => {
          // Error handling is done in processQueueItem
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Process individual queue item
   */
  private async processQueueItem(queueItem: DownloadQueueItem): Promise<void> {
    const { id, data, onProgress, onComplete, onError } = queueItem;
    const managedDownload = new ManagedDownload(id, data.url, data.options);

    try {
      this.activeDownloads.set(id, managedDownload);
      
      // Execute download with progress tracking
      const result = await this.executeDownload(managedDownload, onProgress);
      
      this.stats.completed++;
      this.stats.totalBytes += result.fileSize;
      
      if (onComplete) {
        onComplete(result);
      }
    } catch (error) {
      const contextualError = this.errorManager.createFromUnknown(
        error,
        ErrorType.NETWORK_ERROR,
        {
          operation: 'queueDownload',
          url: data.url,
          downloadId: id,
        }
      );

      await this.errorManager.handleError(contextualError);

      // Retry logic
      if (queueItem.retries < queueItem.maxRetries && contextualError.retryable) {
        queueItem.retries++;
        
        // Add back to queue with delay
        setTimeout(() => {
          this.queue.unshift(queueItem);
          this.processQueue();
        }, this.config.retryDelay * Math.pow(2, queueItem.retries));
      } else {
        this.stats.failed++;
        
        if (onError) {
          onError(contextualError);
        }
      }
    } finally {
      this.activeDownloads.delete(id);
      await managedDownload.cleanup();
      
      // Continue processing queue
      this.processQueue();
    }
  }

  /**
   * Execute actual download with progress tracking
   */
  private async executeDownload(
    managedDownload: ManagedDownload,
    onProgress?: (progress: ProgressInfo) => void
  ): Promise<DownloadResult> {
    const { url, options } = managedDownload;

    return this.errorManager.wrapAsync(
      async () => {
        // Validate URL
        if (!this.isValidUrl(url)) {
          throw this.errorManager.createError(
            ErrorType.VALIDATION_ERROR,
            'Invalid URL provided',
            { url }
          );
        }

        // Check file size if enabled
        if (options.validateSize && options.maxFileSize) {
          const headResponse = await this.makeRequest('HEAD', url, {
            signal: managedDownload.getAbortSignal(),
            timeout: 10000,
          });

          const contentLength = headResponse.headers.get('content-length');
          if (contentLength && parseInt(contentLength) > options.maxFileSize) {
            throw this.errorManager.createError(
              ErrorType.VALIDATION_ERROR,
              `File size (${contentLength} bytes) exceeds limit (${options.maxFileSize} bytes)`,
              { url, fileSize: contentLength, limit: options.maxFileSize }
            );
          }
        }

        // Progress tracking
        if (onProgress) {
          onProgress({
            current: 0,
            total: 1,
            message: 'Starting download...',
            cancellable: true,
          });
        }

        // Make download request
        const response = await this.makeRequest('GET', url, {
          signal: managedDownload.getAbortSignal(),
          timeout: options.timeout || 30000,
        });

        if (!response.ok) {
          throw this.errorManager.createError(
            ErrorType.NETWORK_ERROR,
            `HTTP ${response.status}: ${response.statusText}`,
            { url, status: response.status }
          );
        }

        // Read response with progress tracking
        const data = await this.readResponseWithProgress(
          response,
          onProgress,
          managedDownload.getAbortSignal()
        );

        // Validate downloaded content
        if (!this.validateDownloadedContent(data, response.headers.get('content-type'))) {
          throw this.errorManager.createError(
            ErrorType.VALIDATION_ERROR,
            'Downloaded content appears to be invalid',
            { url, contentType: response.headers.get('content-type') }
          );
        }

        const result: DownloadResult = {
          success: true,
          url,
          source: 'DownloadManager',
          fileSize: data.byteLength,
          data,
        };

        if (onProgress) {
          onProgress({
            current: 1,
            total: 1,
            message: 'Download completed',
            cancellable: false,
          });
        }

        return result;
      },
      ErrorType.NETWORK_ERROR,
      {
        operation: 'executeDownload',
        url,
        downloadId: managedDownload.id,
      }
    );
  }

  /**
   * Make HTTP request with proper error handling
   */
  private async makeRequest(
    method: string,
    url: string,
    options: {
      signal?: AbortSignal;
      timeout?: number;
      headers?: Record<string, string>;
    } = {}
  ): Promise<Response> {
    try {
      // Use Zotero's HTTP request if available, otherwise fallback to fetch
      if (typeof Zotero !== 'undefined' && Zotero.HTTP) {
        const response = await Zotero.HTTP.request(method, url, {
          timeout: options.timeout || 30000,
          headers: {
            'User-Agent': 'Zotero Zotadata/1.0',
            ...options.headers,
          },
          responseType: 'arraybuffer',
        });

        // Convert Zotero response to standard Response format
        return {
          ok: response.status >= 200 && response.status < 300,
          status: response.status,
          statusText: response.statusText || '',
          headers: new Map(Object.entries(response.getAllResponseHeaders() || {})),
          arrayBuffer: () => Promise.resolve(response.response),
        } as Response;
      } else {
        // Fallback to fetch for testing/standalone use
        return fetch(url, {
          method,
          signal: options.signal,
          headers: {
            'User-Agent': 'Zotero Zotadata/1.0',
            ...options.headers,
          },
        });
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw this.errorManager.createError(
          ErrorType.NETWORK_ERROR,
          'Download was cancelled',
          { url }
        );
      }
      throw error;
    }
  }

  /**
   * Read response with progress tracking
   */
  private async readResponseWithProgress(
    response: Response,
    onProgress?: (progress: ProgressInfo) => void,
    signal?: AbortSignal
  ): Promise<ArrayBuffer> {
    const contentLength = response.headers.get('content-length');
    const total = contentLength ? parseInt(contentLength) : 0;

    if (response.arrayBuffer) {
      // Simple case - read entire response
      const data = await response.arrayBuffer();
      
      if (onProgress && total > 0) {
        onProgress({
          current: total,
          total,
          message: 'Download completed',
          cancellable: false,
        });
      }
      
      return data;
    }

    // Stream reading with progress (if supported)
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Response body not readable');
    }

    const chunks: Uint8Array[] = [];
    let receivedLength = 0;

    try {
      while (true) {
        if (signal?.aborted) {
          throw new Error('Download was cancelled');
        }

        const { done, value } = await reader.read();
        
        if (done) break;
        
        chunks.push(value);
        receivedLength += value.length;

        if (onProgress) {
          onProgress({
            current: receivedLength,
            total: total || receivedLength,
            message: `Downloaded ${this.formatBytes(receivedLength)}${total ? ` of ${this.formatBytes(total)}` : ''}`,
            cancellable: true,
          });
        }
      }
    } finally {
      reader.releaseLock();
    }

    // Combine chunks
    const combinedArray = new Uint8Array(receivedLength);
    let position = 0;
    for (const chunk of chunks) {
      combinedArray.set(chunk, position);
      position += chunk.length;
    }

    return combinedArray.buffer;
  }

  /**
   * Validate downloaded content
   */
  private validateDownloadedContent(data: ArrayBuffer, contentType?: string | null): boolean {
    if (data.byteLength === 0) {
      return false;
    }

    // Basic validation for PDF files
    if (contentType?.includes('pdf') || this.isPDFData(data)) {
      return this.validatePDF(data);
    }

    // For other file types, basic size check is sufficient
    return data.byteLength > 100; // Minimum reasonable file size
  }

  /**
   * Check if data is PDF
   */
  private isPDFData(data: ArrayBuffer): boolean {
    const view = new Uint8Array(data);
    const pdfSignature = [0x25, 0x50, 0x44, 0x46]; // %PDF
    
    if (view.length < 4) return false;
    
    for (let i = 0; i < 4; i++) {
      if (view[i] !== pdfSignature[i]) return false;
    }
    
    return true;
  }

  /**
   * Validate PDF content
   */
  private validatePDF(data: ArrayBuffer): boolean {
    if (!this.isPDFData(data)) return false;
    
    const view = new Uint8Array(data);
    const endSignature = [0x25, 0x25, 0x45, 0x4F, 0x46]; // %%EOF
    
    // Check for PDF end marker in last 1024 bytes
    const searchStart = Math.max(0, view.length - 1024);
    for (let i = searchStart; i <= view.length - 5; i++) {
      let match = true;
      for (let j = 0; j < 5; j++) {
        if (view[i + j] !== endSignature[j]) {
          match = false;
          break;
        }
      }
      if (match) return true;
    }
    
    return false;
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Format bytes for display
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }
} 