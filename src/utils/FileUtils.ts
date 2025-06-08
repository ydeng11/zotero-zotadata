import { ErrorManager, ErrorType } from '@/core';

/**
 * File type detection result
 */
interface FileTypeInfo {
  mimeType: string;
  extension: string;
  isSupported: boolean;
  confidence: number;
}

/**
 * File validation result
 */
interface FileValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  fileSize: number;
  fileType?: FileTypeInfo;
}

/**
 * File utility functions for handling and validating files
 */
export class FileUtils {
  private static errorManager = new ErrorManager();

  // Supported file types for attachments
  private static readonly SUPPORTED_TYPES = new Map([
    ['application/pdf', { ext: '.pdf', category: 'document' }],
    ['application/epub+zip', { ext: '.epub', category: 'document' }],
    ['text/html', { ext: '.html', category: 'document' }],
    ['text/plain', { ext: '.txt', category: 'document' }],
    ['application/vnd.openxmlformats-officedocument.wordprocessingml.document', { ext: '.docx', category: 'document' }],
    ['application/msword', { ext: '.doc', category: 'document' }],
    ['application/rtf', { ext: '.rtf', category: 'document' }],
  ]);

  // File signatures for type detection
  private static readonly FILE_SIGNATURES = new Map([
    ['PDF', { signature: [0x25, 0x50, 0x44, 0x46], mimeType: 'application/pdf' }],
    ['EPUB', { signature: [0x50, 0x4B, 0x03, 0x04], mimeType: 'application/epub+zip' }],
    ['ZIP', { signature: [0x50, 0x4B, 0x03, 0x04], mimeType: 'application/zip' }],
    ['HTML', { signature: [0x3C, 0x21, 0x44, 0x4F], mimeType: 'text/html' }], // <!DO
    ['HTML2', { signature: [0x3C, 0x68, 0x74, 0x6D], mimeType: 'text/html' }], // <htm
  ]);

  /**
   * Validate file data
   */
  static validateFile(
    data: ArrayBuffer,
    expectedType?: string,
    maxSize = 100 * 1024 * 1024 // 100MB default
  ): FileValidationResult {
    const result: FileValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      fileSize: data.byteLength,
    };

    // Check file size
    if (data.byteLength === 0) {
      result.valid = false;
      result.errors.push('File is empty');
      return result;
    }

    if (data.byteLength > maxSize) {
      result.valid = false;
      result.errors.push(`File size (${this.formatFileSize(data.byteLength)}) exceeds maximum (${this.formatFileSize(maxSize)})`);
      return result;
    }

    // Detect file type
    result.fileType = this.detectFileType(data);
    
    if (!result.fileType.isSupported) {
      result.warnings.push(`File type ${result.fileType.mimeType} may not be supported`);
    }

    // Check against expected type
    if (expectedType && result.fileType.mimeType !== expectedType) {
      if (result.fileType.confidence < 0.8) {
        result.warnings.push(`Expected ${expectedType}, detected ${result.fileType.mimeType} (low confidence)`);
      } else {
        result.valid = false;
        result.errors.push(`Expected ${expectedType}, but file appears to be ${result.fileType.mimeType}`);
      }
    }

    // Specific validation based on file type
    if (result.fileType.mimeType === 'application/pdf') {
      const pdfValidation = this.validatePDF(data);
      if (!pdfValidation.valid) {
        result.valid = false;
        result.errors.push(...pdfValidation.errors);
      }
    }

    return result;
  }

  /**
   * Detect file type from binary data
   */
  static detectFileType(data: ArrayBuffer): FileTypeInfo {
    const view = new Uint8Array(data);
    
    // Check against known signatures
    for (const [name, { signature, mimeType }] of this.FILE_SIGNATURES) {
      if (this.matchesSignature(view, signature)) {
        const typeInfo = this.SUPPORTED_TYPES.get(mimeType);
        return {
          mimeType,
          extension: typeInfo?.ext || this.getExtensionFromMimeType(mimeType),
          isSupported: this.SUPPORTED_TYPES.has(mimeType),
          confidence: 0.9,
        };
      }
    }

    // Fallback: try to detect text files
    if (this.isTextFile(view)) {
      return {
        mimeType: 'text/plain',
        extension: '.txt',
        isSupported: true,
        confidence: 0.6,
      };
    }

    // Unknown file type
    return {
      mimeType: 'application/octet-stream',
      extension: '.bin',
      isSupported: false,
      confidence: 0.1,
    };
  }

  /**
   * Validate PDF file structure
   */
  static validatePDF(data: ArrayBuffer): { valid: boolean; errors: string[] } {
    const view = new Uint8Array(data);
    const errors: string[] = [];

    // Check PDF header
    const pdfSignature = [0x25, 0x50, 0x44, 0x46]; // %PDF
    if (!this.matchesSignature(view, pdfSignature)) {
      errors.push('Missing PDF header signature');
    }

    // Check PDF version
    if (view.length > 8) {
      const versionBytes = view.slice(5, 8);
      const version = String.fromCharCode(...versionBytes);
      if (!/^\d\.\d$/.test(version)) {
        errors.push('Invalid PDF version format');
      }
    }

    // Check for PDF trailer (%%EOF)
    const trailerSignature = [0x25, 0x25, 0x45, 0x4F, 0x46]; // %%EOF
    let hasTrailer = false;
    
    // Search in last 1024 bytes
    const searchStart = Math.max(0, view.length - 1024);
    for (let i = searchStart; i <= view.length - 5; i++) {
      if (this.matchesSignature(view.slice(i), trailerSignature)) {
        hasTrailer = true;
        break;
      }
    }

    if (!hasTrailer) {
      errors.push('Missing PDF trailer (%%EOF)');
    }

    // Check minimum file size (valid PDFs are usually at least 1KB)
    if (view.length < 1024) {
      errors.push('PDF file appears to be too small to be valid');
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Generate safe filename from title
   */
  static generateSafeFilename(
    title: string,
    extension?: string,
    maxLength = 255
  ): string {
    // Remove or replace invalid characters
    let filename = title
      .replace(/[<>:"/\\|?*]/g, '_') // Replace invalid characters
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Remove leading/trailing dots and spaces
    filename = filename.replace(/^[.\s]+|[.\s]+$/g, '');

    // Ensure filename isn't empty
    if (!filename) {
      filename = 'attachment';
    }

    // Add extension if provided
    if (extension) {
      const ext = extension.startsWith('.') ? extension : `.${extension}`;
      filename += ext;
    }

    // Truncate if too long (leave room for extension)
    if (filename.length > maxLength) {
      const extLength = extension ? extension.length + 1 : 0;
      const maxBase = maxLength - extLength;
      const base = filename.substring(0, maxBase - 3) + '...';
      filename = extension ? base + extension : base;
    }

    return filename;
  }

  /**
   * Get file extension from MIME type
   */
  static getExtensionFromMimeType(mimeType: string): string {
    const typeInfo = this.SUPPORTED_TYPES.get(mimeType);
    if (typeInfo) {
      return typeInfo.ext;
    }

    // Common MIME type to extension mappings
    const commonTypes: Record<string, string> = {
      'text/plain': '.txt',
      'text/html': '.html',
      'text/css': '.css',
      'text/javascript': '.js',
      'application/json': '.json',
      'application/xml': '.xml',
      'image/jpeg': '.jpg',
      'image/png': '.png',
      'image/gif': '.gif',
      'image/svg+xml': '.svg',
    };

    return commonTypes[mimeType] || '.bin';
  }

  /**
   * Get MIME type from file extension
   */
  static getMimeTypeFromExtension(extension: string): string {
    const ext = extension.toLowerCase().startsWith('.') ? extension.toLowerCase() : `.${extension.toLowerCase()}`;
    
    for (const [mimeType, info] of this.SUPPORTED_TYPES) {
      if (info.ext === ext) {
        return mimeType;
      }
    }

    // Common extension to MIME type mappings
    const commonExtensions: Record<string, string> = {
      '.txt': 'text/plain',
      '.html': 'text/html',
      '.htm': 'text/html',
      '.css': 'text/css',
      '.js': 'text/javascript',
      '.json': 'application/json',
      '.xml': 'application/xml',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.png': 'image/png',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
    };

    return commonExtensions[ext] || 'application/octet-stream';
  }

  /**
   * Check if file type is supported for attachments
   */
  static isSupportedFileType(mimeType: string): boolean {
    return this.SUPPORTED_TYPES.has(mimeType);
  }

  /**
   * Format file size in human-readable format
   */
  static formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  }

  /**
   * Create blob URL with automatic tracking for cleanup
   */
  static createBlobUrl(data: ArrayBuffer, mimeType: string): string {
    const blob = new Blob([data], { type: mimeType });
    return URL.createObjectURL(blob);
  }

  /**
   * Download blob as file (for testing/debugging)
   */
  static downloadBlob(data: ArrayBuffer, filename: string, mimeType: string): void {
    const blob = new Blob([data], { type: mimeType });
    const url = URL.createObjectURL(blob);
    
    try {
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  /**
   * Compare file contents
   */
  static compareFiles(file1: ArrayBuffer, file2: ArrayBuffer): {
    identical: boolean;
    similarity: number;
    sizeDifference: number;
  } {
    const view1 = new Uint8Array(file1);
    const view2 = new Uint8Array(file2);
    
    const sizeDifference = Math.abs(view1.length - view2.length);
    
    if (view1.length !== view2.length) {
      return {
        identical: false,
        similarity: 0,
        sizeDifference,
      };
    }

    let matches = 0;
    for (let i = 0; i < view1.length; i++) {
      if (view1[i] === view2[i]) {
        matches++;
      }
    }

    const similarity = matches / view1.length;
    
    return {
      identical: similarity === 1,
      similarity,
      sizeDifference,
    };
  }

  /**
   * Extract text content from PDF (basic implementation)
   */
  static extractTextFromPDF(data: ArrayBuffer): string | null {
    try {
      const view = new Uint8Array(data);
      const text = String.fromCharCode(...view);
      
      // Very basic PDF text extraction - look for text between BT/ET markers
      const textMatches = text.match(/BT\s+(.*?)\s+ET/gs);
      if (textMatches) {
        return textMatches
          .map(match => match.replace(/BT\s+|\s+ET/g, ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      }
      
      return null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if signature matches at beginning of data
   */
  private static matchesSignature(data: Uint8Array, signature: number[]): boolean {
    if (data.length < signature.length) return false;
    
    for (let i = 0; i < signature.length; i++) {
      if (data[i] !== signature[i]) return false;
    }
    
    return true;
  }

  /**
   * Check if data appears to be text
   */
  private static isTextFile(data: Uint8Array): boolean {
    if (data.length === 0) return false;
    
    // Sample first 1024 bytes
    const sample = data.slice(0, Math.min(1024, data.length));
    let textBytes = 0;
    
    for (const byte of sample) {
      // Count printable ASCII and common UTF-8 characters
      if ((byte >= 32 && byte <= 126) || byte === 9 || byte === 10 || byte === 13) {
        textBytes++;
      }
    }
    
    // If more than 80% are text characters, consider it text
    return (textBytes / sample.length) > 0.8;
  }
} 