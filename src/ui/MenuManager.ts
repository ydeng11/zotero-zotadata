import { ErrorManager, ErrorType } from '@/core';
import type { AddonData } from '@/core/types';

/**
 * Menu item configuration
 */
interface MenuItemConfig {
  id: string;
  label: string;
  icon?: string;
  tooltip?: string;
  action?: () => Promise<void> | void;
  condition?: () => boolean;
  separator?: boolean;
  submenu?: MenuItemConfig[];
}

/**
 * Menu section configuration
 */
interface MenuSection {
  id: string;
  items: MenuItemConfig[];
  insertAfter?: string;
  insertBefore?: string;
}

/**
 * Menu context types
 */
type MenuContext = 'item' | 'collection' | 'toolbar' | 'tools';

/**
 * Menu Manager for creating and managing UI elements
 */
export class MenuManager {
  private addonData: AddonData;
  private errorManager: ErrorManager;
  private registeredMenus = new Map<string, Element>();
  private eventListeners = new Map<string, () => void>();

  constructor(addonData: AddonData) {
    this.addonData = addonData;
    this.errorManager = new ErrorManager();
  }

  /**
   * Initialize all menus
   */
  async init(): Promise<void> {
    try {
      await this.createItemContextMenu();
      await this.createCollectionContextMenu();
      await this.createToolsMenu();
      await this.createToolbarButtons();
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.ZOTERO_ERROR,
        { operation: 'initMenus' }
      );
    }
  }

  /**
   * Clean up all menus and listeners
   */
  async cleanup(): Promise<void> {
    try {
      // Remove all registered menus
      for (const [id, element] of this.registeredMenus) {
        element.remove?.();
      }
      this.registeredMenus.clear();

      // Remove all event listeners
      for (const [id, cleanup] of this.eventListeners) {
        cleanup();
      }
      this.eventListeners.clear();
    } catch (error) {
      console.warn('Error cleaning up menus:', error);
    }
  }

  /**
   * Create item context menu
   */
  private async createItemContextMenu(): Promise<void> {
    const itemMenuConfig: MenuSection = {
      id: 'attachment-finder-item',
      insertAfter: 'zotero-itemmenu-separator-1',
      items: [
        {
          id: 'zotero-itemmenu-attachment-finder-find',
          label: 'Find Attachments',
          icon: 'chrome://zotero/skin/attach.png',
          tooltip: 'Search for and download attachments for selected items',
          action: () => this.handleFindAttachments(),
          condition: () => this.hasValidSelectedItems(),
        },
        {
          id: 'zotero-itemmenu-attachment-finder-check',
          label: 'Check Attachments',
          icon: 'chrome://zotero/skin/cross.png',
          tooltip: 'Check and clean up existing attachments',
          action: () => this.handleCheckAttachments(),
          condition: () => this.hasValidSelectedItems(),
        },
        {
          id: 'zotero-itemmenu-attachment-finder-metadata',
          label: 'Fetch Metadata',
          icon: 'chrome://zotero/skin/treeitem-book.png',
          tooltip: 'Fetch additional metadata from academic APIs',
          action: () => this.handleFetchMetadata(),
          condition: () => this.hasValidSelectedItems(),
        },
        {
          id: 'zotero-itemmenu-attachment-finder-separator',
          label: '',
          separator: true,
        },
        {
          id: 'zotero-itemmenu-attachment-finder-arxiv',
          label: 'Process arXiv Items',
          icon: 'chrome://zotero/skin/treeitem-attachment-pdf.png',
          tooltip: 'Process and download PDFs for arXiv preprints',
          action: () => this.handleProcessArxiv(),
          condition: () => this.hasArxivItems(),
        }
      ]
    };

    await this.createMenuSection('zotero-itemmenu', itemMenuConfig);
  }

  /**
   * Create collection context menu
   */
  private async createCollectionContextMenu(): Promise<void> {
    const collectionMenuConfig: MenuSection = {
      id: 'attachment-finder-collection',
      insertAfter: 'zotero-collectionmenu-separator',
      items: [
        {
          id: 'zotero-collectionmenu-attachment-finder-batch',
          label: 'Batch Find Attachments',
          icon: 'chrome://zotero/skin/attach.png',
          tooltip: 'Find attachments for all items in this collection',
          action: () => this.handleBatchFindAttachments(),
          condition: () => this.hasSelectedCollection(),
        },
        {
          id: 'zotero-collectionmenu-attachment-finder-clean',
          label: 'Clean Collection Attachments',
          icon: 'chrome://zotero/skin/cross.png',
          tooltip: 'Check and clean attachments for all items in this collection',
          action: () => this.handleBatchCheckAttachments(),
          condition: () => this.hasSelectedCollection(),
        }
      ]
    };

    await this.createMenuSection('zotero-collectionmenu', collectionMenuConfig);
  }

  /**
   * Create Tools menu entries
   */
  private async createToolsMenu(): Promise<void> {
    const toolsMenuConfig: MenuSection = {
      id: 'attachment-finder-tools',
      insertBefore: 'menu_Tools_Popup-separator-1',
      items: [
        {
          id: 'tools-attachment-finder-preferences',
          label: 'Attachment Finder Preferences...',
          icon: 'chrome://zotero/skin/prefs.png',
          tooltip: 'Configure Attachment Finder settings',
          action: () => this.handlePreferences(),
        },
        {
          id: 'tools-attachment-finder-status',
          label: 'Attachment Finder Status',
          icon: 'chrome://zotero/skin/report.png',
          tooltip: 'Show plugin status and statistics',
          action: () => this.handleShowStatus(),
        }
      ]
    };

    await this.createMenuSection('menu_ToolsPopup', toolsMenuConfig);
  }

  /**
   * Create toolbar buttons
   */
  private async createToolbarButtons(): Promise<void> {
    const toolbar = document.getElementById('zotero-toolbar');
    if (!toolbar) return;

    // Main action button
    const findButton = this.createElement('toolbarbutton', {
      id: 'attachment-finder-find-button',
      label: 'Find Attachments',
      tooltiptext: 'Find attachments for selected items',
      image: 'chrome://zotero/skin/attach.png',
      oncommand: () => this.handleFindAttachments(),
    });

    // Add button to toolbar
    const insertPoint = document.getElementById('zotero-toolbar-separator') || toolbar.lastElementChild;
    if (insertPoint) {
      toolbar.insertBefore(findButton, insertPoint);
      this.registeredMenus.set('attachment-finder-find-button', findButton);
    }
  }

  /**
   * Create a menu section with items
   */
  private async createMenuSection(parentMenuId: string, config: MenuSection): Promise<void> {
    const parentMenu = document.getElementById(parentMenuId);
    if (!parentMenu) {
      console.warn(`Parent menu not found: ${parentMenuId}`);
      return;
    }

    let insertPoint: Element | null = null;
    
    // Find insertion point
    if (config.insertAfter) {
      insertPoint = document.getElementById(config.insertAfter);
      if (insertPoint) {
        insertPoint = insertPoint.nextElementSibling;
      }
    } else if (config.insertBefore) {
      insertPoint = document.getElementById(config.insertBefore);
    }

    // Create menu items
    for (const itemConfig of config.items) {
      const menuItem = await this.createMenuItem(itemConfig);
      if (menuItem) {
        if (insertPoint) {
          parentMenu.insertBefore(menuItem, insertPoint);
        } else {
          parentMenu.appendChild(menuItem);
        }
        this.registeredMenus.set(itemConfig.id, menuItem);
      }
    }
  }

  /**
   * Create a single menu item
   */
  private async createMenuItem(config: MenuItemConfig): Promise<Element | null> {
    try {
      if (config.separator) {
        return this.createElement('menuseparator', {
          id: config.id,
        });
      }

      const attributes: Record<string, any> = {
        id: config.id,
        label: config.label,
      };

      if (config.icon) {
        attributes.image = config.icon;
      }

      if (config.tooltip) {
        attributes.tooltiptext = config.tooltip;
      }

      // Add condition check
      if (config.condition) {
        attributes.hidden = !config.condition();
        
        // Update visibility on selection change
        const updateVisibility = () => {
          const element = document.getElementById(config.id);
          if (element) {
            element.hidden = !config.condition!();
          }
        };
        
        // Listen for selection changes
        this.addSelectionListener(config.id, updateVisibility);
      }

      const menuItem = this.createElement('menuitem', attributes);

      // Add click handler
      const handleClick = () => {
        try {
          if (config.action) {
            config.action();
          }
        } catch (error) {
          this.errorManager.handleError(
            this.errorManager.createFromUnknown(
              error,
              ErrorType.ZOTERO_ERROR,
              { menuItem: config.id }
            )
          );
        }
      };

      menuItem.addEventListener('command', handleClick);
      this.eventListeners.set(config.id, () => {
        menuItem.removeEventListener('command', handleClick);
      });

      return menuItem;
    } catch (error) {
      console.warn(`Failed to create menu item ${config.id}:`, error);
      return null;
    }
  }

  /**
   * Create DOM element with attributes
   */
  private createElement(tagName: string, attributes: Record<string, any>): Element {
    const element = document.createElementNS(
      'http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul',
      tagName
    );

    for (const [key, value] of Object.entries(attributes)) {
      if (key === 'oncommand' && typeof value === 'function') {
        element.addEventListener('command', value);
      } else {
        element.setAttribute(key, String(value));
      }
    }

    return element;
  }

  /**
   * Add listener for selection changes
   */
  private addSelectionListener(id: string, callback: () => void): void {
    // In a real implementation, this would listen to Zotero selection events
    // For now, we'll use a simple interval-based approach
    const interval = setInterval(callback, 1000);
    
    const cleanup = () => clearInterval(interval);
    this.eventListeners.set(`${id}-selection`, cleanup);
  }

  /**
   * Menu action handlers
   */
  private async handleFindAttachments(): Promise<void> {
    // This would call the main attachment finder functionality
    const attachmentFinder = (globalThis as any).Zotero.AttachmentFinder;
    if (attachmentFinder) {
      await attachmentFinder.findSelectedFiles();
    }
  }

  private async handleCheckAttachments(): Promise<void> {
    const attachmentFinder = (globalThis as any).Zotero.AttachmentFinder;
    if (attachmentFinder) {
      await attachmentFinder.checkSelectedItems();
    }
  }

  private async handleFetchMetadata(): Promise<void> {
    const attachmentFinder = (globalThis as any).Zotero.AttachmentFinder;
    if (attachmentFinder) {
      await attachmentFinder.fetchMetadataForSelectedItems();
    }
  }

  private async handleProcessArxiv(): Promise<void> {
    const attachmentFinder = (globalThis as any).Zotero.AttachmentFinder;
    if (attachmentFinder) {
      await attachmentFinder.processArxivItems();
    }
  }

  private async handleBatchFindAttachments(): Promise<void> {
    // Implementation for batch processing collection items
    console.log('Batch find attachments for collection');
  }

  private async handleBatchCheckAttachments(): Promise<void> {
    // Implementation for batch checking collection items
    console.log('Batch check attachments for collection');
  }

  private async handlePreferences(): Promise<void> {
    // Open preferences dialog
    const preferencesManager = (globalThis as any).Zotero.AttachmentFinder?.preferencesManager;
    if (preferencesManager) {
      await preferencesManager.openPreferences();
    }
  }

  private async handleShowStatus(): Promise<void> {
    // Show status dialog
    console.log('Show attachment finder status');
  }

  /**
   * Condition check helpers
   */
  private hasValidSelectedItems(): boolean {
    try {
      const zoteroPane = Zotero.getActiveZoteroPane();
      if (!zoteroPane) return false;

      const selectedItems = zoteroPane.getSelectedItems();
      return selectedItems.length > 0 && selectedItems.some(item => item.isTopLevelItem());
    } catch {
      return false;
    }
  }

  private hasArxivItems(): boolean {
    try {
      const zoteroPane = Zotero.getActiveZoteroPane();
      if (!zoteroPane) return false;

      const selectedItems = zoteroPane.getSelectedItems();
      return selectedItems.some(item => {
        const url = item.getField('url') || '';
        const extra = item.getField('extra') || '';
        return url.includes('arxiv.org') || extra.includes('arXiv:');
      });
    } catch {
      return false;
    }
  }

  private hasSelectedCollection(): boolean {
    try {
      const zoteroPane = Zotero.getActiveZoteroPane();
      if (!zoteroPane) return false;

      const selectedCollection = zoteroPane.getSelectedCollection();
      return !!selectedCollection;
    } catch {
      return false;
    }
  }

  /**
   * Update menu visibility based on current context
   */
  updateMenuVisibility(): void {
    for (const [id] of this.registeredMenus) {
      const updateCallback = this.eventListeners.get(`${id}-selection`);
      if (updateCallback) {
        // Trigger update
        setTimeout(updateCallback, 0);
      }
    }
  }

  /**
   * Enable/disable menu items based on plugin state
   */
  setMenusEnabled(enabled: boolean): void {
    for (const [id, element] of this.registeredMenus) {
      if (element.hasAttribute('label')) { // Skip separators
        element.setAttribute('disabled', enabled ? 'false' : 'true');
      }
    }
  }

  /**
   * Get menu statistics
   */
  getStats(): {
    registeredMenus: number;
    eventListeners: number;
  } {
    return {
      registeredMenus: this.registeredMenus.size,
      eventListeners: this.eventListeners.size,
    };
  }
} 