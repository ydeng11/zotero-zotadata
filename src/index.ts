import { ErrorManager, ErrorType } from '@/core';
import { AttachmentChecker } from '@/modules/AttachmentChecker';
import { CrossRefAPI } from '@/apis/CrossRefAPI';
import { ZoteroUtils } from '@/utils/ZoteroUtils';
import { MenuParentID } from '@/constants/Menus';
import type { AddonData, PluginConfig } from '@/core/types';

/**
 * Main Zotadata plugin class
 */
class ZotadataPlugin {
  private errorManager: ErrorManager;
  private attachmentChecker: AttachmentChecker;
  private crossRefAPI: CrossRefAPI;
  private config: PluginConfig;
  private addonData: AddonData | null = null;
  private addedElementIDs: string[] = [];
  private menuRegistrations: (() => void)[] = [];

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
      userAgent: 'Zotero Zotadata/1.0',  
    };
  }

  /**
   * Initialize the plugin
   */
  async init(data: AddonData): Promise<void> {
    return this.errorManager.wrapAsync(
      async () => {
        this.log('Initializing Zotadata plugin...');
        this.addonData = data;

        // Register menus using new API or fallback to legacy
        await this.registerMenus();

        this.log('Zotadata plugin initialized successfully');
      },
      ErrorType.ZOTERO_ERROR,
      { operation: 'init', addonId: data.id }
    );
  }

  /**
   * Startup the plugin
   */
  async startup(): Promise<void> {
    this.log('Zotadata plugin started');
  }

  /**
   * Shutdown the plugin
   */
  async shutdown(): Promise<void> {
    return this.errorManager.wrapAsync(
      async () => {
        this.log('Shutting down Zotadata plugin...');

        // Unregister menus registered with MenuManager
        for (const unregister of this.menuRegistrations) {
          try {
            unregister();
          } catch {
            // Ignore errors during cleanup
          }
        }
        this.menuRegistrations = [];

        // Remove UI elements from all windows (legacy XUL elements)
        await this.removeFromAllWindows();

        this.log('Zotadata plugin shut down successfully');
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
    this.log('Zotadata plugin uninstalled');
  }

  /**
   * Register menus using new MenuManager API or legacy XUL approach
   */
  private async registerMenus(): Promise<void> {
    try {
      if (ZoteroUtils.hasNewMenuAPI()) {
        await this.registerMenusWithMenuAPI();
      } else {
        await this.registerMenusLegacy();
      }
    } catch (error) {
      this.log(`Failed to register menus: ${error}`);
    }
  }

  /**
   * Register menus using Zotero 8+ MenuManager API
   */
  private async registerMenusWithMenuAPI(): Promise<void> {
    const pluginID = this.addonData?.id || 'zotadata@zotero.org';
    const menuItems = [
      { id: 'zotero-itemmenu-zotadata-check', label: 'Check Attachments', callback: () => this.handleCheckAttachments() },
      { id: 'zotero-itemmenu-zotadata-fetch-metadata', label: 'Fetch Metadata', callback: () => this.handleFetchMetadata() },
      { id: 'zotero-itemmenu-zotadata-process-arxiv', label: 'Process arXiv Items', callback: () => this.handleProcessArxiv() },
      { id: 'zotero-itemmenu-zotadata-find-files', label: 'Find Missing Files', callback: () => this.handleFindFiles() },
    ];

    for (const item of menuItems) {
      const unregister = (Zotero as any).MenuManager.registerMenu(item.id, {
        pluginID,
        label: item.label,
        callback: item.callback,
      });
      this.menuRegistrations.push(unregister);
    }

    this.log('Registered menus using MenuManager API');
  }

  /**
   * Register menus using legacy XUL-based approach (Zotero 6/7 compatibility)
   */
  private async registerMenusLegacy(): Promise<void> {
    const windows = Zotero.getMainWindows();
    for (const window of windows) {
      if (window.ZoteroPane) {
        await this.addToWindow(window);
      }
    }
    this.log('Registered menus using legacy XUL approach');
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
      const menu = ZoteroUtils.createXULElement(doc, 'menu', {
        id: 'zotero-itemmenu-zotadata-menu',
        class: 'menu-iconic',
        label: 'Zotadata',
      });

      const menuPopup = ZoteroUtils.createXULElement(doc, 'menupopup', {
        id: 'zotero-itemmenu-zotadata-menupopup',
      });

      // Create menu items
      const menuItems = [
        {
          id: 'zotero-itemmenu-zotadata-check',
          label: 'Check Attachments',
          handler: () => this.handleCheckAttachments(),
        },
        {
          id: 'zotero-itemmenu-zotadata-fetch-metadata',
          label: 'Fetch Metadata',
          handler: () => this.handleFetchMetadata(),
        },
        {
          id: 'zotero-itemmenu-zotadata-process-arxiv',
          label: 'Process arXiv Items',
          handler: () => this.handleProcessArxiv(),
        },
        {
          id: 'zotero-itemmenu-zotadata-find-files',
          label: 'Find Missing Files',
          handler: () => this.handleFindFiles(),
        },
      ];

      for (const item of menuItems) {
        const menuItem = ZoteroUtils.createXULElement(doc, 'menuitem', {
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
      const parentMenu = doc.getElementById(MenuParentID.ITEM_CONTEXT);
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

        // Use native Promise.allSettled for batch processing
        const results = await Promise.allSettled(
          selectedItems.map(item => this.attachmentChecker.checkItemAttachments(item))
        );

        // Aggregate results
        const successfulResults = results
          .filter((r): r is PromiseFulfilledResult<any> => r.status === 'fulfilled')
          .map(r => r.value);

        const failedCount = results.filter(r => r.status === 'rejected').length;

        if (successfulResults.length === 0) {
          this.showMessage('No attachment checks completed successfully');
          return;
        }

        // For single item, show direct results
        if (selectedItems.length === 1) {
          const stats = successfulResults[0];
          const message = this.attachmentChecker.generateResultsMessage(stats);
          this.showMessage(message);
        } else {
          // For multiple items, aggregate the already-computed results
          const totalStats = successfulResults.reduce(
            (acc, stats) => ({
              valid: acc.valid + (stats.valid || 0),
              removed: acc.removed + (stats.removed || 0),
              weblinks: acc.weblinks + (stats.weblinks || 0),
              errors: acc.errors + (stats.errors || 0),
            }),
            { valid: 0, removed: 0, weblinks: 0, errors: 0 }
          );

          const message = this.attachmentChecker.generateResultsMessage(
            totalStats,
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
      Zotero.log(`Zotadata: ${message}`);
    } else {
      console.log(`Zotadata: ${message}`);
    }
  }
}

// Global plugin instance
let zotadataPlugin: ZotadataPlugin;

// Plugin lifecycle functions for Zotero
export function init(data: AddonData): Promise<void> {
  zotadataPlugin = new ZotadataPlugin();
  return zotadataPlugin.init(data);
}

export function startup(): Promise<void> {
  return zotadataPlugin?.startup() || Promise.resolve();
}

export function shutdown(): Promise<void> {
  return zotadataPlugin?.shutdown() || Promise.resolve();
}

export function uninstall(): Promise<void> {
  return zotadataPlugin?.uninstall() || Promise.resolve();
}

// Export for testing
export { ZotadataPlugin }; 