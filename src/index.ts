import { ErrorManager, ErrorType } from '@/core';
import { AttachmentChecker } from '@/modules/AttachmentChecker';
import { CrossRefAPI } from '@/apis/CrossRefAPI';
import type { AddonData, PluginConfig } from '@/core/types';

/**
 * Main Attachment Finder plugin class
 */
class AttachmentFinderPlugin {
  private errorManager: ErrorManager;
  private attachmentChecker: AttachmentChecker;
  private crossRefAPI: CrossRefAPI;
  private config: PluginConfig;
  private addonData: AddonData | null = null;
  private addedElementIDs: string[] = [];

  constructor() {
    this.errorManager = new ErrorManager();
    this.attachmentChecker = new AttachmentChecker();
    this.crossRefAPI = new CrossRefAPI();
    
    // Default configuration
    this.config = {
      maxConcurrentDownloads: 3,
      maxFileSize: 100 * 1024 * 1024, // 100MB
      downloadTimeout: 30000,
      enabledAPIs: ['CrossRef', 'OpenAlex', 'SemanticScholar'],
      rateLimits: {
        CrossRef: { requests: 50, window: 1000 },
        OpenAlex: { requests: 100, window: 1000 },
        SemanticScholar: { requests: 100, window: 1000 },
      },
      cacheSettings: { ttl: 3600000, maxSize: 1000 },
      userAgent: 'Zotero Attachment Finder/2.0',
    };
  }

  /**
   * Initialize the plugin
   */
  async init(data: AddonData): Promise<void> {
    return this.errorManager.wrapAsync(
      async () => {
        this.log('Initializing Attachment Finder plugin...');
        this.addonData = data;
        
        // Add UI elements to all windows
        await this.addToAllWindows();
        
        this.log('Attachment Finder plugin initialized successfully');
      },
      ErrorType.ZOTERO_ERROR,
      { operation: 'init', addonId: data.id }
    );
  }

  /**
   * Startup the plugin
   */
  async startup(): Promise<void> {
    this.log('Attachment Finder plugin started');
  }

  /**
   * Shutdown the plugin
   */
  async shutdown(): Promise<void> {
    return this.errorManager.wrapAsync(
      async () => {
        this.log('Shutting down Attachment Finder plugin...');
        
        // Remove UI elements from all windows
        await this.removeFromAllWindows();
        
        this.log('Attachment Finder plugin shut down successfully');
      },
      ErrorType.ZOTERO_ERROR,
      { operation: 'shutdown' }
    );
  }

  /**
   * Uninstall the plugin
   */
  async uninstall(): Promise<void> {
    await this.shutdown();
    this.log('Attachment Finder plugin uninstalled');
  }

  /**
   * Add UI elements to all Zotero windows
   */
  private async addToAllWindows(): Promise<void> {
    try {
      const windows = Zotero.getMainWindows();
      this.log(`Found ${windows.length} Zotero windows`);
      
      for (const window of windows) {
        if (window.ZoteroPane) {
          await this.addToWindow(window);
        }
      }
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.ZOTERO_ERROR,
        { operation: 'addToAllWindows' }
      );
    }
  }

  /**
   * Add UI elements to a specific window
   */
  private async addToWindow(window: Window): Promise<void> {
    try {
      const doc = window.document;
      
      // Create main menu
      const menu = this.createElement(doc, 'menu', {
        id: 'zotero-itemmenu-attachment-finder-menu',
        class: 'menu-iconic',
        label: 'Attachment Finder',
      });

      const menuPopup = this.createElement(doc, 'menupopup', {
        id: 'zotero-itemmenu-attachment-finder-menupopup',
      });

      // Create menu items
      const menuItems = [
        {
          id: 'zotero-itemmenu-attachment-finder-check',
          label: 'Check Attachments',
          handler: () => this.handleCheckAttachments(),
        },
        {
          id: 'zotero-itemmenu-attachment-finder-fetch-metadata',
          label: 'Fetch Metadata',
          handler: () => this.handleFetchMetadata(),
        },
        {
          id: 'zotero-itemmenu-attachment-finder-process-arxiv',
          label: 'Process arXiv Items',
          handler: () => this.handleProcessArxiv(),
        },
        {
          id: 'zotero-itemmenu-attachment-finder-find-files',
          label: 'Find Missing Files',
          handler: () => this.handleFindFiles(),
        },
      ];

      for (const item of menuItems) {
        const menuItem = this.createElement(doc, 'menuitem', {
          id: item.id,
          label: item.label,
        });
        
        menuItem.addEventListener('command', item.handler);
        menuPopup.appendChild(menuItem);
        this.addedElementIDs.push(item.id);
      }

      menu.appendChild(menuPopup);
      this.addedElementIDs.push(menu.id);

      // Add to parent menu
      const parentMenu = doc.getElementById('zotero-itemmenu');
      if (parentMenu) {
        parentMenu.appendChild(menu);
        this.log('Successfully added menu to window');
      } else {
        throw new Error('Could not find zotero-itemmenu parent element');
      }
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.ZOTERO_ERROR,
        { operation: 'addToWindow' }
      );
    }
  }

  /**
   * Remove UI elements from all windows
   */
  private async removeFromAllWindows(): Promise<void> {
    try {
      const windows = Zotero.getMainWindows();
      
      for (const window of windows) {
        if (window.ZoteroPane) {
          await this.removeFromWindow(window);
        }
      }
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.ZOTERO_ERROR,
        { operation: 'removeFromAllWindows' }
      );
    }
  }

  /**
   * Remove UI elements from a specific window
   */
  private async removeFromWindow(window: Window): Promise<void> {
    try {
      const doc = window.document;
      
      for (const id of this.addedElementIDs) {
        const element = doc.getElementById(id);
        if (element) {
          element.remove();
          this.log(`Removed element: ${id}`);
        }
      }
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.ZOTERO_ERROR,
        { operation: 'removeFromWindow' }
      );
    }
  }

  /**
   * Create XUL element with attributes
   */
  private createElement(
    doc: Document,
    name: string,
    attributes: Record<string, string> = {}
  ): Element {
    const element = Zotero.platformMajorVersion >= 102
      ? doc.createXULElement(name)
      : doc.createElementNS(
          'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul',
          name
        );

    for (const [key, value] of Object.entries(attributes)) {
      element.setAttribute(key, value);
    }

    return element;
  }

  /**
   * Handle check attachments command
   */
  private async handleCheckAttachments(): Promise<void> {
    return this.errorManager.wrapAsync(
      async () => {
        this.log('Check Attachments command triggered');
        
        const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
        if (selectedItems.length === 0) {
          this.showMessage('No items selected');
          return;
        }

        this.log(`Checking attachments for ${selectedItems.length} items`);
        
        if (selectedItems.length === 1) {
          const stats = await this.attachmentChecker.checkItemAttachments(selectedItems[0]);
          const message = this.attachmentChecker.generateResultsMessage(stats);
          this.showMessage(message);
        } else {
          const result = await this.attachmentChecker.checkMultipleItems(selectedItems);
          const message = this.attachmentChecker.generateResultsMessage(
            result.totalStats,
            selectedItems.length
          );
          this.showMessage(message);
        }
      },
      ErrorType.ZOTERO_ERROR,
      { operation: 'handleCheckAttachments' }
    );
  }

  /**
   * Handle fetch metadata command
   */
  private async handleFetchMetadata(): Promise<void> {
    return this.errorManager.wrapAsync(
      async () => {
        this.log('Fetch Metadata command triggered');
        
        const selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
        if (selectedItems.length === 0) {
          this.showMessage('No items selected');
          return;
        }

        // TODO: Implement metadata fetching
        this.showMessage('Metadata fetching not yet implemented in TypeScript version');
      },
      ErrorType.ZOTERO_ERROR,
      { operation: 'handleFetchMetadata' }
    );
  }

  /**
   * Handle process arXiv command
   */
  private async handleProcessArxiv(): Promise<void> {
    return this.errorManager.wrapAsync(
      async () => {
        this.log('Process arXiv Items command triggered');
        
        // TODO: Implement arXiv processing
        this.showMessage('arXiv processing not yet implemented in TypeScript version');
      },
      ErrorType.ZOTERO_ERROR,
      { operation: 'handleProcessArxiv' }
    );
  }

  /**
   * Handle find files command
   */
  private async handleFindFiles(): Promise<void> {
    return this.errorManager.wrapAsync(
      async () => {
        this.log('Find Missing Files command triggered');
        
        // TODO: Implement file finding
        this.showMessage('File finding not yet implemented in TypeScript version');
      },
      ErrorType.ZOTERO_ERROR,
      { operation: 'handleFindFiles' }
    );
  }

  /**
   * Show message to user
   */
  private showMessage(message: string): void {
    try {
      const windows = Zotero.getMainWindows();
      if (windows.length > 0) {
        windows[0].alert(message);
      }
    } catch (error) {
      this.log(`Failed to show message: ${error}`);
    }
  }

  /**
   * Log message
   */
  private log(message: string): void {
    if (typeof Zotero !== 'undefined' && Zotero.log) {
      Zotero.log(`Attachment Finder: ${message}`);
    } else {
      console.log(`Attachment Finder: ${message}`);
    }
  }
}

// Global plugin instance
let attachmentFinderPlugin: AttachmentFinderPlugin;

// Plugin lifecycle functions for Zotero
export function init(data: AddonData): Promise<void> {
  attachmentFinderPlugin = new AttachmentFinderPlugin();
  return attachmentFinderPlugin.init(data);
}

export function startup(): Promise<void> {
  return attachmentFinderPlugin?.startup() || Promise.resolve();
}

export function shutdown(): Promise<void> {
  return attachmentFinderPlugin?.shutdown() || Promise.resolve();
}

export function uninstall(): Promise<void> {
  return attachmentFinderPlugin?.uninstall() || Promise.resolve();
}

// Export for testing
export { AttachmentFinderPlugin }; 