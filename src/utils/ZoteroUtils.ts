import { ErrorManager, ErrorType } from '@/core';

/**
 * Zotero item type information
 */
interface ItemTypeInfo {
  id: number;
  name: string;
  isRegularItem: boolean;
  isAttachment: boolean;
  isNote: boolean;
  canHaveAttachments: boolean;
}

/**
 * Attachment information
 */
interface AttachmentInfo {
  id: number;
  title: string;
  url?: string;
  filePath?: string;
  linkMode: number;
  mimeType?: string;
  fileExists: boolean;
  fileSize?: number;
  parentItemId?: number;
}

/**
 * Item validation result
 */
interface ItemValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  itemType: ItemTypeInfo;
  hasTitle: boolean;
  hasAuthors: boolean;
  hasYear: boolean;
  hasDOI: boolean;
  canProcessForAttachments: boolean;
}

/**
 * Field mapping for metadata updates
 */
interface FieldMapping {
  zoteroField: string;
  sourceField: string;
  transform?: (value: any) => any;
  priority: number;
}

/**
 * Zotero-specific utility functions
 */
export class ZoteroUtils {
  private static errorManager = new ErrorManager();

  // Zotero item types that can have attachments
  private static readonly ATTACHABLE_ITEM_TYPES = new Set([
    'journalArticle',
    'book',
    'bookSection',
    'conferencePaper',
    'thesis',
    'manuscript',
    'report',
    'webpage',
    'document',
    'preprint',
  ]);

  // Field mappings for common metadata updates
  private static readonly FIELD_MAPPINGS: FieldMapping[] = [
    { zoteroField: 'title', sourceField: 'title', priority: 1 },
    { zoteroField: 'DOI', sourceField: 'doi', priority: 2 },
    { zoteroField: 'date', sourceField: 'year', transform: (year: number) => year?.toString(), priority: 3 },
    { zoteroField: 'publicationTitle', sourceField: 'journal', priority: 4 },
    { zoteroField: 'volume', sourceField: 'volume', priority: 5 },
    { zoteroField: 'issue', sourceField: 'issue', priority: 6 },
    { zoteroField: 'pages', sourceField: 'pages', priority: 7 },
    { zoteroField: 'abstractNote', sourceField: 'abstract', priority: 8 },
    { zoteroField: 'url', sourceField: 'url', priority: 9 },
  ];

  /**
   * Get currently selected items in Zotero
   */
  static getSelectedItems(): Zotero.Item[] {
    try {
      const zoteroPane = Zotero.getActiveZoteroPane();
      if (!zoteroPane) {
        return [];
      }

      const selectedItems = zoteroPane.getSelectedItems();
      return selectedItems.filter(item => item && !item.isNote());
    } catch (error) {
      console.error('Failed to get selected items:', error);
      return [];
    }
  }

  /**
   * Get selected items that can have attachments
   */
  static getSelectedAttachableItems(): Zotero.Item[] {
    const selectedItems = this.getSelectedItems();
    return selectedItems.filter(item => this.canItemHaveAttachments(item));
  }

  /**
   * Validate Zotero item for processing
   */
  static validateItem(item: Zotero.Item): ItemValidationResult {
    const result: ItemValidationResult = {
      valid: true,
      errors: [],
      warnings: [],
      itemType: this.getItemTypeInfo(item),
      hasTitle: false,
      hasAuthors: false,
      hasYear: false,
      hasDOI: false,
      canProcessForAttachments: false,
    };

    try {
      // Check if item exists and is valid
      if (!item || !item.id) {
        result.valid = false;
        result.errors.push('Invalid item: item is null or has no ID');
        return result;
      }

      // Check item type
      result.canProcessForAttachments = this.canItemHaveAttachments(item);
      if (!result.canProcessForAttachments) {
        result.warnings.push(`Item type '${result.itemType.name}' typically cannot have attachments`);
      }

      // Check title
      const title = item.getField('title');
      result.hasTitle = !!title && title.trim().length > 0;
      if (!result.hasTitle) {
        result.warnings.push('Item has no title');
      }

      // Check authors
      const creators = item.getCreators();
      result.hasAuthors = creators && creators.length > 0;
      if (!result.hasAuthors) {
        result.warnings.push('Item has no authors');
      }

      // Check year
      const date = item.getField('date');
      result.hasYear = !!date && /\d{4}/.test(date);
      if (!result.hasYear) {
        result.warnings.push('Item has no publication year');
      }

      // Check DOI
      const doi = item.getField('DOI');
      result.hasDOI = !!doi && doi.trim().length > 0;
      if (!result.hasDOI) {
        result.warnings.push('Item has no DOI');
      }

      // Overall validation
      if (!result.hasTitle && !result.hasDOI) {
        result.valid = false;
        result.errors.push('Item must have either a title or DOI for processing');
      }

    } catch (error) {
      result.valid = false;
      result.errors.push(`Error validating item: ${error.message}`);
    }

    return result;
  }

  /**
   * Get detailed attachment information
   */
  static async getAttachmentInfo(attachmentId: number): Promise<AttachmentInfo | null> {
    try {
      const attachment = Zotero.Items.get(attachmentId);
      if (!attachment || !attachment.isAttachment()) {
        return null;
      }

      const info: AttachmentInfo = {
        id: attachmentId,
        title: attachment.getField('title') || 'Untitled Attachment',
        linkMode: attachment.attachmentLinkMode,
        fileExists: false,
      };

      // Get URL for URL attachments
      if (attachment.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_URL) {
        info.url = attachment.getField('url');
      }

      // Get file information for file attachments
      if (attachment.attachmentLinkMode === Zotero.Attachments.LINK_MODE_IMPORTED_FILE ||
          attachment.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_FILE) {
        
        info.filePath = attachment.getFilePath();
        info.mimeType = attachment.attachmentContentType;

        // Check if file exists
        if (info.filePath) {
          const file = attachment.getFile();
          info.fileExists = file && file.exists();
          
          if (info.fileExists) {
            try {
              info.fileSize = file.fileSize;
            } catch (error) {
              // File size unavailable
            }
          }
        }
      }

      // Get parent item ID
      const parentItem = attachment.getSource();
      if (parentItem) {
        info.parentItemId = parentItem;
      }

      return info;
    } catch (error) {
      console.error(`Failed to get attachment info for ${attachmentId}:`, error);
      return null;
    }
  }

  /**
   * Check if item can have attachments
   */
  static canItemHaveAttachments(item: Zotero.Item): boolean {
    try {
      if (!item || item.isAttachment() || item.isNote()) {
        return false;
      }

      const itemType = Zotero.ItemTypes.getName(item.itemTypeID);
      return this.ATTACHABLE_ITEM_TYPES.has(itemType);
    } catch (error) {
      return false;
    }
  }

  /**
   * Create attachment from file data
   */
  static async createAttachmentFromData(
    parentItemId: number,
    data: ArrayBuffer,
    filename: string,
    mimeType: string,
    source?: string
  ): Promise<Zotero.Item | null> {
    try {
      const parentItem = Zotero.Items.get(parentItemId);
      if (!parentItem) {
        throw this.errorManager.createError(
          ErrorType.ZOTERO_ERROR,
          `Parent item ${parentItemId} not found`,
          { parentItemId }
        );
      }

      // Create a blob from the data
      const blob = new Blob([data], { type: mimeType });
      
      // Try different methods for creating attachment
      let attachment: Zotero.Item | null = null;

      try {
        // Method 1: Using importFromFile if available
        if (Zotero.Attachments.importFromFile) {
          // Create temporary file (this is a simplified approach)
          const tempFile = await this.createTempFile(data, filename);
          attachment = await Zotero.Attachments.importFromFile({
            file: tempFile,
            parentItemID: parentItemId,
          });
        }
      } catch (error) {
        // Fall back to other methods
      }

      if (!attachment) {
        try {
          // Method 2: Using linkFromURL with blob URL
          const blobUrl = URL.createObjectURL(blob);
          
          attachment = await Zotero.Attachments.linkFromURL({
            url: blobUrl,
            parentItemID: parentItemId,
            title: filename,
            contentType: mimeType,
          });

          // Clean up blob URL
          URL.revokeObjectURL(blobUrl);
        } catch (error) {
          // Continue to next method
        }
      }

      if (!attachment) {
        throw this.errorManager.createError(
          ErrorType.ZOTERO_ERROR,
          'Failed to create attachment with available methods',
          { parentItemId, filename, mimeType }
        );
      }

      // Add source information if provided
      if (source && attachment) {
        try {
          attachment.setField('title', `${filename} (${source})`);
          await attachment.saveTx();
        } catch (error) {
          // Non-critical error
        }
      }

      return attachment;
    } catch (error) {
      const contextualError = this.errorManager.createFromUnknown(
        error,
        ErrorType.ZOTERO_ERROR,
        { operation: 'createAttachmentFromData', parentItemId, filename }
      );
      console.error('Failed to create attachment:', contextualError);
      return null;
    }
  }

  /**
   * Update item metadata from external source
   */
  static async updateItemMetadata(
    item: Zotero.Item,
    metadata: Record<string, any>,
    options: { overwrite?: boolean; source?: string } = {}
  ): Promise<{ updated: boolean; changes: string[]; errors: string[] }> {
    const result = {
      updated: false,
      changes: [] as string[],
      errors: [] as string[],
    };

    try {
      const { overwrite = false, source } = options;

      // Apply field mappings
      for (const mapping of this.FIELD_MAPPINGS) {
        try {
          const sourceValue = metadata[mapping.sourceField];
          if (sourceValue === undefined || sourceValue === null) {
            continue;
          }

          const currentValue = item.getField(mapping.zoteroField);
          
          // Skip if field already has value and not overwriting
          if (currentValue && !overwrite) {
            continue;
          }

          // Transform value if needed
          let newValue = sourceValue;
          if (mapping.transform) {
            newValue = mapping.transform(sourceValue);
          }

          // Only update if value is different
          if (newValue !== currentValue) {
            item.setField(mapping.zoteroField, newValue);
            result.changes.push(`${mapping.zoteroField}: "${currentValue}" → "${newValue}"`);
            result.updated = true;
          }
        } catch (error) {
          result.errors.push(`Failed to update ${mapping.zoteroField}: ${error.message}`);
        }
      }

      // Update authors if provided
      if (metadata.authors && Array.isArray(metadata.authors)) {
        try {
          const existingCreators = item.getCreators();
          
          if (existingCreators.length === 0 || overwrite) {
            const newCreators = metadata.authors.map((author: any) => ({
              firstName: author.given || author.firstName || '',
              lastName: author.family || author.lastName || author.name || '',
              creatorType: 'author',
            }));

            item.setCreators(newCreators);
            result.changes.push(`authors: Updated ${newCreators.length} authors`);
            result.updated = true;
          }
        } catch (error) {
          result.errors.push(`Failed to update authors: ${error.message}`);
        }
      }

      // Save changes
      if (result.updated) {
        await item.saveTx();
        
        // Add note about update source
        if (source) {
          try {
            const note = `Metadata updated from ${source} on ${new Date().toLocaleString()}`;
            await this.addNoteToItem(item, note);
          } catch (error) {
            // Non-critical error
          }
        }
      }

    } catch (error) {
      result.errors.push(`Failed to update metadata: ${error.message}`);
    }

    return result;
  }

  /**
   * Add note to item
   */
  static async addNoteToItem(item: Zotero.Item, noteText: string): Promise<Zotero.Item | null> {
    try {
      const note = new Zotero.Item('note');
      note.setNote(noteText);
      note.parentID = item.id;
      await note.saveTx();
      return note;
    } catch (error) {
      console.error('Failed to add note to item:', error);
      return null;
    }
  }

  /**
   * Get item type information
   */
  static getItemTypeInfo(item: Zotero.Item): ItemTypeInfo {
    try {
      const itemTypeID = item.itemTypeID;
      const itemTypeName = Zotero.ItemTypes.getName(itemTypeID);
      
      return {
        id: itemTypeID,
        name: itemTypeName,
        isRegularItem: !item.isAttachment() && !item.isNote(),
        isAttachment: item.isAttachment(),
        isNote: item.isNote(),
        canHaveAttachments: this.canItemHaveAttachments(item),
      };
    } catch (error) {
      return {
        id: 0,
        name: 'unknown',
        isRegularItem: false,
        isAttachment: false,
        isNote: false,
        canHaveAttachments: false,
      };
    }
  }

  /**
   * Extract identifiers from item
   */
  static extractIdentifiers(item: Zotero.Item): {
    doi?: string;
    isbn?: string;
    pmid?: string;
    arxivId?: string;
    url?: string;
  } {
    const identifiers: any = {};

    try {
      // DOI
      const doi = item.getField('DOI');
      if (doi) {
        identifiers.doi = doi.trim();
      }

      // ISBN
      const isbn = item.getField('ISBN');
      if (isbn) {
        identifiers.isbn = isbn.trim();
      }

      // PMID
      const extra = item.getField('extra');
      if (extra) {
        const pmidMatch = extra.match(/PMID:\s*(\d+)/i);
        if (pmidMatch) {
          identifiers.pmid = pmidMatch[1];
        }

        // arXiv ID
        const arxivMatch = extra.match(/arXiv:\s*([a-z-]+\/\d+|\d+\.\d+)/i);
        if (arxivMatch) {
          identifiers.arxivId = arxivMatch[1];
        }
      }

      // URL
      const url = item.getField('url');
      if (url) {
        identifiers.url = url.trim();
      }

    } catch (error) {
      console.error('Failed to extract identifiers:', error);
    }

    return identifiers;
  }

  /**
   * Format item citation for display
   */
  static formatItemCitation(item: Zotero.Item, style: 'short' | 'full' = 'short'): string {
    try {
      const title = item.getField('title') || 'Untitled';
      const creators = item.getCreators();
      const year = item.getField('date')?.match(/\d{4}/)?.[0];

      if (style === 'short') {
        const firstAuthor = creators[0];
        const authorName = firstAuthor 
          ? `${firstAuthor.lastName}${creators.length > 1 ? ' et al.' : ''}`
          : 'Unknown Author';
        
        return `${authorName}${year ? ` (${year})` : ''}: ${title.substring(0, 50)}${title.length > 50 ? '...' : ''}`;
      } else {
        const authorNames = creators.map(c => `${c.firstName} ${c.lastName}`).join(', ');
        const publication = item.getField('publicationTitle');
        
        let citation = `${authorNames}${year ? ` (${year})` : ''}. ${title}.`;
        if (publication) {
          citation += ` ${publication}.`;
        }
        
        return citation;
      }
    } catch (error) {
      return 'Error formatting citation';
    }
  }

  /**
   * Create temporary file from data (simplified implementation)
   */
  private static async createTempFile(data: ArrayBuffer, filename: string): Promise<any> {
    // This is a simplified implementation
    // In a real plugin, you would use Zotero's file utilities
    try {
      const tempDir = Zotero.getTempDirectory();
      const tempFile = tempDir.clone();
      tempFile.append(filename);
      
      // Write data to file (simplified)
      // In practice, you'd use proper file I/O methods
      return tempFile;
    } catch (error) {
      throw this.errorManager.createError(
        ErrorType.FILE_ERROR,
        `Failed to create temporary file: ${error.message}`,
        { filename }
      );
    }
  }
} 