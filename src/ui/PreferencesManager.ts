import { ErrorManager, ErrorType } from '@/core';
import type { AddonData } from '@/core/types';

/**
 * Preference configuration
 */
interface PreferenceConfig {
  key: string;
  type: 'boolean' | 'string' | 'number' | 'choice';
  label: string;
  description?: string;
  defaultValue: any;
  choices?: Array<{ value: any; label: string }>;
  min?: number;
  max?: number;
  validation?: (value: any) => boolean;
}

/**
 * Preference section
 */
interface PreferenceSection {
  id: string;
  title: string;
  description?: string;
  preferences: PreferenceConfig[];
}

/**
 * Plugin preferences
 */
interface PluginPreferences {
  // API Settings
  'api.crossref.enabled': boolean;
  'api.openalex.enabled': boolean;
  'api.semanticscholar.enabled': boolean;
  'api.arxiv.enabled': boolean;
  'api.libgen.enabled': boolean;
  'api.pmc.enabled': boolean;
  'api.timeout': number;
  'api.retries': number;
  
  // Download Settings
  'download.maxConcurrent': number;
  'download.maxFileSize': number;
  'download.timeout': number;
  'download.allowedTypes': string;
  
  // Cache Settings
  'cache.enabled': boolean;
  'cache.ttl': number;
  'cache.maxSize': number;
  
  // UI Settings
  'ui.showProgress': boolean;
  'ui.autoCloseDialogs': boolean;
  'ui.showSuccessNotifications': boolean;
  'ui.confirmDownloads': boolean;
  
  // Advanced Settings
  'advanced.debug': boolean;
  'advanced.logLevel': string;
  'advanced.userAgent': string;
}

/**
 * Preferences Manager for user configuration
 */
export class PreferencesManager {
  private addonData: AddonData;
  private errorManager: ErrorManager;
  private prefPrefix = 'extensions.zotero.attachmentfinder';

  constructor(addonData: AddonData) {
    this.addonData = addonData;
    this.errorManager = new ErrorManager();
  }

  /**
   * Initialize preferences with defaults
   */
  async init(): Promise<void> {
    try {
      await this.loadPreferences();
      await this.migratePreferences();
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.ZOTERO_ERROR,
        { operation: 'initPreferences' }
      );
    }
  }

  /**
   * Open preferences dialog
   */
  async openPreferences(): Promise<void> {
    // Implementation would open preferences dialog
    console.log('Opening preferences dialog');
  }

  /**
   * Get preference value
   */
  getPreference(key: string, defaultValue?: any): any {
    try {
      if (typeof Zotero !== 'undefined' && Zotero.Prefs) {
        return Zotero.Prefs.get(`${this.prefPrefix}.${key}`, defaultValue);
      }
    } catch (error) {
      console.warn(`Failed to get preference ${key}:`, error);
    }
    return defaultValue;
  }

  /**
   * Set preference value
   */
  async setPreference(key: string, value: any): Promise<void> {
    try {
      if (typeof Zotero !== 'undefined' && Zotero.Prefs) {
        await Zotero.Prefs.set(`${this.prefPrefix}.${key}`, value);
      }
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.ZOTERO_ERROR,
        { operation: 'setPreference', key, value }
      );
    }
  }

  /**
   * Get all preferences
   */
  getAllPreferences(): PluginPreferences {
    const preferences: PluginPreferences = {
      'api.crossref.enabled': this.getPreference('api.crossref.enabled', true),
      'api.openalex.enabled': this.getPreference('api.openalex.enabled', true),
      'api.semanticscholar.enabled': this.getPreference('api.semanticscholar.enabled', true),
      'api.arxiv.enabled': this.getPreference('api.arxiv.enabled', true),
      'api.libgen.enabled': this.getPreference('api.libgen.enabled', false),
      'api.pmc.enabled': this.getPreference('api.pmc.enabled', true),
      'api.timeout': this.getPreference('api.timeout', 30),
      'api.retries': this.getPreference('api.retries', 3),
      'download.maxConcurrent': this.getPreference('download.maxConcurrent', 3),
      'download.maxFileSize': this.getPreference('download.maxFileSize', 100),
      'download.timeout': this.getPreference('download.timeout', 120),
      'download.allowedTypes': this.getPreference('download.allowedTypes', 'pdf,epub,html'),
      'cache.enabled': this.getPreference('cache.enabled', true),
      'cache.ttl': this.getPreference('cache.ttl', 60),
      'cache.maxSize': this.getPreference('cache.maxSize', 1000),
      'ui.showProgress': this.getPreference('ui.showProgress', true),
      'ui.autoCloseDialogs': this.getPreference('ui.autoCloseDialogs', true),
      'ui.showSuccessNotifications': this.getPreference('ui.showSuccessNotifications', true),
      'ui.confirmDownloads': this.getPreference('ui.confirmDownloads', false),
      'advanced.debug': this.getPreference('advanced.debug', false),
      'advanced.logLevel': this.getPreference('advanced.logLevel', 'info'),
      'advanced.userAgent': this.getPreference('advanced.userAgent', 'Zotero Attachment Finder/2.0'),
    };
    return preferences;
  }

  /**
   * Reset preferences to defaults
   */
  async resetPreferences(): Promise<void> {
    try {
      const defaults = this.getAllPreferences();
      
      for (const [key, value] of Object.entries(defaults)) {
        await this.setPreference(key, value);
      }
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.ZOTERO_ERROR,
        { operation: 'resetPreferences' }
      );
    }
  }

  /**
   * Export preferences to JSON
   */
  exportPreferences(): string {
    return JSON.stringify(this.getAllPreferences(), null, 2);
  }

  /**
   * Import preferences from JSON
   */
  async importPreferences(json: string): Promise<void> {
    try {
      const imported = JSON.parse(json) as Partial<PluginPreferences>;
      
      for (const [key, value] of Object.entries(imported)) {
        if (key in this.getAllPreferences()) {
          await this.setPreference(key, value);
        }
      }
    } catch (error) {
      throw this.errorManager.createFromUnknown(
        error,
        ErrorType.VALIDATION_ERROR,
        { operation: 'importPreferences' }
      );
    }
  }

  /**
   * Get preference configuration for UI
   */
  getPreferenceConfig(): PreferenceSection[] {
    return [
      {
        id: 'api',
        title: 'API Settings',
        description: 'Configure academic database APIs',
        preferences: [
          {
            key: 'api.crossref.enabled',
            type: 'boolean',
            label: 'Enable CrossRef API',
            description: 'Search for DOIs and metadata from CrossRef',
            defaultValue: true,
          },
          {
            key: 'api.openalex.enabled',
            type: 'boolean',
            label: 'Enable OpenAlex API',
            description: 'Search for open access papers from OpenAlex',
            defaultValue: true,
          },
          {
            key: 'api.semanticscholar.enabled',
            type: 'boolean',
            label: 'Enable Semantic Scholar API',
            description: 'Search for papers from Semantic Scholar',
            defaultValue: true,
          },
          {
            key: 'api.arxiv.enabled',
            type: 'boolean',
            label: 'Enable arXiv API',
            description: 'Search for preprints from arXiv',
            defaultValue: true,
          },
          {
            key: 'api.libgen.enabled',
            type: 'boolean',
            label: 'Enable Library Genesis',
            description: 'Search for books from Library Genesis',
            defaultValue: false,
          },
          {
            key: 'api.pmc.enabled',
            type: 'boolean',
            label: 'Enable PubMed Central API',
            description: 'Search for open access papers from PMC',
            defaultValue: true,
          },
          {
            key: 'api.timeout',
            type: 'number',
            label: 'API Timeout (seconds)',
            description: 'Maximum time to wait for API responses',
            defaultValue: 30,
            min: 5,
            max: 300,
          },
          {
            key: 'api.retries',
            type: 'number',
            label: 'API Retries',
            description: 'Number of times to retry failed API requests',
            defaultValue: 3,
            min: 0,
            max: 10,
          },
        ],
      },
      {
        id: 'download',
        title: 'Download Settings',
        description: 'Configure file download behavior',
        preferences: [
          {
            key: 'download.maxConcurrent',
            type: 'number',
            label: 'Max Concurrent Downloads',
            description: 'Maximum number of simultaneous downloads',
            defaultValue: 3,
            min: 1,
            max: 10,
          },
          {
            key: 'download.maxFileSize',
            type: 'number',
            label: 'Max File Size (MB)',
            description: 'Maximum file size to download',
            defaultValue: 100,
            min: 1,
            max: 1000,
          },
          {
            key: 'download.timeout',
            type: 'number',
            label: 'Download Timeout (seconds)',
            description: 'Maximum time for file downloads',
            defaultValue: 120,
            min: 30,
            max: 600,
          },
          {
            key: 'download.allowedTypes',
            type: 'string',
            label: 'Allowed File Types',
            description: 'Comma-separated list of allowed file extensions',
            defaultValue: 'pdf,epub,html',
          },
        ],
      },
      {
        id: 'cache',
        title: 'Cache Settings',
        description: 'Configure response caching',
        preferences: [
          {
            key: 'cache.enabled',
            type: 'boolean',
            label: 'Enable Caching',
            description: 'Cache API responses to improve performance',
            defaultValue: true,
          },
          {
            key: 'cache.ttl',
            type: 'number',
            label: 'Cache TTL (minutes)',
            description: 'How long to keep cached responses',
            defaultValue: 60,
            min: 1,
            max: 1440,
          },
          {
            key: 'cache.maxSize',
            type: 'number',
            label: 'Max Cache Size',
            description: 'Maximum number of cached responses',
            defaultValue: 1000,
            min: 100,
            max: 10000,
          },
        ],
      },
      {
        id: 'ui',
        title: 'User Interface',
        description: 'Configure UI behavior',
        preferences: [
          {
            key: 'ui.showProgress',
            type: 'boolean',
            label: 'Show Progress Dialogs',
            description: 'Display progress during operations',
            defaultValue: true,
          },
          {
            key: 'ui.autoCloseDialogs',
            type: 'boolean',
            label: 'Auto-close Success Dialogs',
            description: 'Automatically close dialogs after successful operations',
            defaultValue: true,
          },
          {
            key: 'ui.showSuccessNotifications',
            type: 'boolean',
            label: 'Show Success Notifications',
            description: 'Show notifications for successful operations',
            defaultValue: true,
          },
          {
            key: 'ui.confirmDownloads',
            type: 'boolean',
            label: 'Confirm Downloads',
            description: 'Ask for confirmation before downloading files',
            defaultValue: false,
          },
        ],
      },
      {
        id: 'advanced',
        title: 'Advanced Settings',
        description: 'Advanced configuration options',
        preferences: [
          {
            key: 'advanced.debug',
            type: 'boolean',
            label: 'Debug Mode',
            description: 'Enable debug logging',
            defaultValue: false,
          },
          {
            key: 'advanced.logLevel',
            type: 'choice',
            label: 'Log Level',
            description: 'Minimum level for log messages',
            defaultValue: 'info',
            choices: [
              { value: 'debug', label: 'Debug' },
              { value: 'info', label: 'Info' },
              { value: 'warn', label: 'Warning' },
              { value: 'error', label: 'Error' },
            ],
          },
          {
            key: 'advanced.userAgent',
            type: 'string',
            label: 'User Agent',
            description: 'User agent string for API requests',
            defaultValue: 'Zotero Attachment Finder/2.0',
          },
        ],
      },
    ];
  }

  /**
   * Private helper methods
   */
  private async loadPreferences(): Promise<void> {
    // Implementation would load preferences from Zotero
  }

  private async migratePreferences(): Promise<void> {
    // Handle any preference migrations here
    // For example, migrating from old preference keys to new ones
  }

  private validatePreference<K extends keyof PluginPreferences>(
    key: K, 
    value: any
  ): boolean {
    const config = this.getPreferenceConfig()
      .flatMap(section => section.preferences)
      .find(pref => pref.key === key);

    if (!config) return true;

    switch (config.type) {
      case 'boolean':
        return typeof value === 'boolean';
      
      case 'number':
        if (typeof value !== 'number') return false;
        if (config.min !== undefined && value < config.min) return false;
        if (config.max !== undefined && value > config.max) return false;
        return true;
      
      case 'string':
        return typeof value === 'string';
      
      case 'choice':
        return config.choices?.some(choice => choice.value === value) ?? false;
      
      default:
        return true;
    }
  }

  /**
   * Get current configuration as object
   */
  getConfig(): {
    api: {
      enabled: Record<string, boolean>;
      timeout: number;
      retries: number;
    };
    download: {
      maxConcurrent: number;
      maxFileSize: number;
      timeout: number;
      allowedTypes: string[];
    };
    cache: {
      enabled: boolean;
      ttl: number;
      maxSize: number;
    };
    ui: {
      showProgress: boolean;
      autoCloseDialogs: boolean;
      showSuccessNotifications: boolean;
      confirmDownloads: boolean;
    };
    advanced: {
      debug: boolean;
      logLevel: string;
      userAgent: string;
    };
  } {
    const prefs = this.getAllPreferences();
    
    return {
      api: {
        enabled: {
          crossref: prefs['api.crossref.enabled'],
          openalex: prefs['api.openalex.enabled'],
          semanticscholar: prefs['api.semanticscholar.enabled'],
          arxiv: prefs['api.arxiv.enabled'],
          libgen: prefs['api.libgen.enabled'],
          pmc: prefs['api.pmc.enabled'],
        },
        timeout: prefs['api.timeout'],
        retries: prefs['api.retries'],
      },
      download: {
        maxConcurrent: prefs['download.maxConcurrent'],
        maxFileSize: prefs['download.maxFileSize'],
        timeout: prefs['download.timeout'],
        allowedTypes: prefs['download.allowedTypes'].split(',').map(t => t.trim()),
      },
      cache: {
        enabled: prefs['cache.enabled'],
        ttl: prefs['cache.ttl'] * 60 * 1000, // Convert to milliseconds
        maxSize: prefs['cache.maxSize'],
      },
      ui: {
        showProgress: prefs['ui.showProgress'],
        autoCloseDialogs: prefs['ui.autoCloseDialogs'],
        showSuccessNotifications: prefs['ui.showSuccessNotifications'],
        confirmDownloads: prefs['ui.confirmDownloads'],
      },
      advanced: {
        debug: prefs['advanced.debug'],
        logLevel: prefs['advanced.logLevel'],
        userAgent: prefs['advanced.userAgent'],
      },
    };
  }
} 