/**
 * Zotero Attachment Finder - Main Script
 * Handles attachment validation, DOI extraction, metadata updates, and file downloads
 */

class AttachmentChecker {
    /**
     * Checks a single Zotero item for the status of its attachments.
     * @param {Object} item - The Zotero item object.
     *                         Expected to have an async method `getAttachmentsObjects()`
     *                         which returns an array of attachment objects.
     *                         Each attachment object is expected to have a `path` property.
     * @returns {Promise<string>} Status: 'valid', 'missing', 'broken', or 'error'.
     */
    async getAttachmentStatus(item) {
        if (!item || typeof item.getAttachmentsObjects !== 'function') {
            return 'error';
        }

        const attachments = await item.getAttachmentsObjects();

        if (!attachments || attachments.length === 0) {
            return 'missing';
        }

        const firstAttachment = attachments[0];

        if (!firstAttachment || !firstAttachment.path) {
            return 'broken';
        }

        try {
            const fileExists = await OS.File.exists(firstAttachment.path);
            if (fileExists) {
                return 'valid';
            } else {
                return 'broken';
            }
        } catch (e) {
            return 'error';
        }
    }

    /**
     * Checks a list of Zotero items and returns their attachment statuses.
     * @param {Array<Object>} items - An array of Zotero item objects.
     * @returns {Promise<Array<Object>>} An array of objects, each containing the itemID
     *                                   and its attachment status.
     */
    async checkItems(items) {
        if (!Array.isArray(items)) {
            return [];
        }

        const results = [];
        for (const item of items) {
            const status = await this.getAttachmentStatus(item);
            results.push({
                itemID: item.id || item.key || null,
                status: status
            });
        }
        return results;
    }
}

AttachmentFinder = {
    initialized: false,

    init: function () {
        if (this.initialized) return;

        // Initialize components
        this.attachmentChecker = new AttachmentChecker();
        this.doiExtractor = new DOIExtractor();
        this.metadataUpdater = new MetadataUpdater();
        this.fileDownloader = new FileDownloader();

        this.initialized = true;
        Zotero.debug("Attachment Finder: Initialized");
    },

    shutdown: function () {
        // Cleanup logic
        this.initialized = false;
        Zotero.debug("Attachment Finder: Shutdown");
    },

    onMainWindowLoad: function (window) {
        // Setup UI for this window
        this.setupEventListeners(window);
        Zotero.debug("Attachment Finder: Window loaded");
    },

    onMainWindowUnload: function (window) {
        // Cleanup for this window
        this.removeEventListeners(window);
        Zotero.debug("Attachment Finder: Window unloaded");
    },

    setupEventListeners: function (window) {
        // Add context menu items dynamically
        var doc = window.document;
        var popup = doc.getElementById('zotero-itemmenu');
        if (popup) {
            popup.addEventListener('popupshowing', (event) => {
                this.onPopupShowing(event, window);
            });
        }
    },

    removeEventListeners: function (window) {
        // Remove our additions
        var doc = window.document;
        var existingItems = doc.querySelectorAll('[id^="attachment-finder-"]');
        existingItems.forEach(item => item.remove());
    },

    onPopupShowing: function (event, window) {
        if (event.target.id !== 'zotero-itemmenu') return;

        // Add menu items dynamically
        this.addContextMenuItems(event.target, window);
    },

    addContextMenuItems: function (popup, window) {
        var doc = window.document;

        // Remove existing items
        let existingItems = popup.querySelectorAll('[id^="attachment-finder-"]');
        existingItems.forEach(item => item.remove());

        // Create separator
        let separator = doc.createXULElement('menuseparator');
        separator.id = 'attachment-finder-separator';
        popup.appendChild(separator);

        // Check Attachments
        let checkItem = doc.createXULElement('menuitem');
        checkItem.id = 'attachment-finder-check';
        checkItem.setAttribute('label', 'Check Attachments');
        checkItem.addEventListener('command', () => this.checkAttachments(window));
        popup.appendChild(checkItem);

        // Update Metadata
        let updateItem = doc.createXULElement('menuitem');
        updateItem.id = 'attachment-finder-update';
        updateItem.setAttribute('label', 'Update Metadata from DOI');
        updateItem.addEventListener('command', () => this.updateMetadata(window));
        popup.appendChild(updateItem);

        // Find Missing Files
        let downloadItem = doc.createXULElement('menuitem');
        downloadItem.id = 'attachment-finder-download';
        downloadItem.setAttribute('label', 'Find Missing Files');
        downloadItem.addEventListener('command', () => this.findMissingFiles(window));
        popup.appendChild(downloadItem);

        // Settings
        let settingsItem = doc.createXULElement('menuitem');
        settingsItem.id = 'attachment-finder-settings';
        settingsItem.setAttribute('label', 'Attachment Finder Settings');
        settingsItem.addEventListener('command', () => this.openSettings(window));
        popup.appendChild(settingsItem);
    },

    // Main functionality methods
    checkAttachments: function (window) {
        let selectedItems = window.ZoteroPane.getSelectedItems();
        if (!selectedItems.length) {
            alert('Please select items to check attachments.');
            return;
        }

        this.attachmentChecker.checkItems(selectedItems);
    },

    updateMetadata: function (window) {
        let selectedItems = window.ZoteroPane.getSelectedItems();
        if (!selectedItems.length) {
            alert('Please select items to update metadata.');
            return;
        }

        this.processItemsForMetadata(selectedItems);
    },

    findMissingFiles: function (window) {
        let selectedItems = window.ZoteroPane.getSelectedItems();
        if (!selectedItems.length) {
            alert('Please select items to find missing files.');
            return;
        }

        this.processItemsForDownload(selectedItems);
    },

    openSettings: function (window) {
        // Open Zotero preferences window - our pane will be available there
        window.openDialog('chrome://zotero/content/preferences/preferences.xul',
            'zotero-prefs',
            'chrome,titlebar,toolbar,centerscreen,modal');
    },

    async processItemsForMetadata(items) {
        for (let item of items) {
            try {
                let doi = this.doiExtractor.extractDOI(item);
                if (doi) {
                    await this.metadataUpdater.updateFromDOI(item, doi);
                }
            } catch (error) {
                Zotero.debug("Error updating metadata for item: " + error);
            }
        }
    },

    async processItemsForDownload(items) {
        for (let item of items) {
            try {
                // Check if item has attachments
                let status = this.attachmentChecker.getAttachmentStatus(item);
                if (status === 'missing') {
                    let doi = this.doiExtractor.extractDOI(item);
                    if (doi) {
                        await this.fileDownloader.findAndDownload(item, doi);
                    }
                }
            } catch (error) {
                Zotero.debug("Error downloading file for item: " + error);
            }
        }
    }
};

/**
 * DOIExtractor Class
 * Extracts and validates DOIs from various sources
 */
function DOIExtractor() {
    this.extractDOI = function (item) {
        // Try DOI field first
        let doi = item.getField('DOI');
        if (doi && this.isValidDOI(doi)) {
            return this.cleanDOI(doi);
        }

        // Try URL field
        let url = item.getField('url');
        if (url) {
            let doiFromURL = this.extractDOIFromURL(url);
            if (doiFromURL) {
                return doiFromURL;
            }
        }

        // Try extra field
        let extra = item.getField('extra');
        if (extra) {
            let doiFromExtra = this.extractDOIFromExtra(extra);
            if (doiFromExtra) {
                return doiFromExtra;
            }
        }

        return null;
    };

    this.isValidDOI = function (doi) {
        // Basic DOI pattern validation
        return /^10\.\d{4,}\/\S+/.test(doi);
    };

    this.cleanDOI = function (doi) {
        // Remove common prefixes
        doi = doi.replace(/^(doi:|DOI:)/i, '');
        doi = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//, '');
        return doi.trim();
    };

    this.extractDOIFromURL = function (url) {
        let match = url.match(/(?:dx\.)?doi\.org\/(.+)/);
        if (match && this.isValidDOI(match[1])) {
            return this.cleanDOI(match[1]);
        }
        return null;
    };

    this.extractDOIFromExtra = function (extra) {
        let match = extra.match(/DOI:\s*(.+)/i);
        if (match && this.isValidDOI(match[1])) {
            return this.cleanDOI(match[1]);
        }
        return null;
    };
}

/**
 * MetadataUpdater Class
 * Updates item metadata using DOI and CrossRef API
 */
function MetadataUpdater() {
    this.updateFromDOI = async function (item, doi) {
        try {
            let metadata = await this.fetchCrossRefMetadata(doi);
            if (metadata) {
                this.updateItemMetadata(item, metadata);
                Zotero.debug(`Updated metadata for item: ${item.getDisplayTitle()}`);
            }
        } catch (error) {
            Zotero.debug(`Failed to update metadata: ${error}`);
            throw error;
        }
    };

    this.fetchCrossRefMetadata = async function (doi) {
        let url = `https://api.crossref.org/works/${doi}`;

        try {
            let response = await Zotero.HTTP.request(
                'GET',
                url,
                {
                    headers: {
                        'Accept': 'application/json',
                        'User-Agent': 'Zotero Attachment Finder/1.0 (mailto:user@example.com)'
                    }
                }
            );

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                return data.message;
            }
        } catch (error) {
            Zotero.debug(`CrossRef API error: ${error}`);
        }

        return null;
    };

    this.updateItemMetadata = function (item, metadata) {
        if (metadata.title && metadata.title.length > 0) {
            item.setField('title', metadata.title[0]);
        }

        if (metadata.author) {
            // Clear existing creators
            item.setCreators([]);

            // Add new creators
            metadata.author.forEach(author => {
                item.setCreator(item.getCreators().length, {
                    firstName: author.given || '',
                    lastName: author.family || '',
                    creatorType: 'author'
                });
            });
        }

        if (metadata.published && metadata.published['date-parts']) {
            let dateparts = metadata.published['date-parts'][0];
            if (dateparts && dateparts.length > 0) {
                let year = dateparts[0];
                let month = dateparts[1] || '';
                let day = dateparts[2] || '';

                item.setField('date', `${year}${month ? '-' + month.toString().padStart(2, '0') : ''}${day ? '-' + day.toString().padStart(2, '0') : ''}`);
            }
        }

        if (metadata['container-title'] && metadata['container-title'].length > 0) {
            item.setField('publicationTitle', metadata['container-title'][0]);
        }

        if (metadata.volume) {
            item.setField('volume', metadata.volume);
        }

        if (metadata.issue) {
            item.setField('issue', metadata.issue);
        }

        if (metadata.page) {
            item.setField('pages', metadata.page);
        }

        item.save();
    };
}

/**
 * FileDownloader Class
 * Downloads files from various open access sources
 */
function FileDownloader() {
    this.findAndDownload = async function (item, doi) {
        try {
            // Try Unpaywall first
            let unpaywallURL = await this.tryUnpaywall(doi);
            if (unpaywallURL) {
                await this.downloadFile(item, unpaywallURL, 'Unpaywall');
                return;
            }

            // Try arXiv
            let arxivURL = await this.tryArxiv(item);
            if (arxivURL) {
                await this.downloadFile(item, arxivURL, 'arXiv');
                return;
            }

            Zotero.debug(`No open access files found for DOI: ${doi}`);
        } catch (error) {
            Zotero.debug(`Error in file download: ${error}`);
            throw error;
        }
    };

    this.tryUnpaywall = async function (doi) {
        let email = Zotero.Prefs.get('extensions.attachment-finder.unpaywallEmail') || 'user@example.com';
        let url = `https://api.unpaywall.org/v2/${doi}?email=${email}`;

        try {
            let response = await Zotero.HTTP.request('GET', url);
            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.is_oa && data.best_oa_location) {
                    return data.best_oa_location.url_for_pdf;
                }
            }
        } catch (error) {
            Zotero.debug(`Unpaywall API error: ${error}`);
        }

        return null;
    };

    this.tryArxiv = async function (item) {
        let title = item.getField('title');
        if (!title) return null;

        let query = `search_query=ti:"${encodeURIComponent(title)}"&start=0&max_results=1`;
        let url = `http://export.arxiv.org/api/query?${query}`;

        try {
            let response = await Zotero.HTTP.request('GET', url);
            if (response.status === 200) {
                // Parse XML response
                let parser = new DOMParser();
                let doc = parser.parseFromString(response.responseText, 'text/xml');
                let entries = doc.getElementsByTagName('entry');

                if (entries.length > 0) {
                    let entry = entries[0];
                    let id = entry.getElementsByTagName('id')[0].textContent;
                    // Convert to PDF URL
                    let arxivId = id.split('/').pop();
                    return `https://arxiv.org/pdf/${arxivId}.pdf`;
                }
            }
        } catch (error) {
            Zotero.debug(`arXiv API error: ${error}`);
        }

        return null;
    };

    this.downloadFile = async function (item, url, source) {
        try {
            Zotero.debug(`Downloading file from ${source}: ${url}`);

            // Create attachment
            let attachment = await Zotero.Attachments.importFromURL({
                url: url,
                parentItemID: item.id,
                title: `${source} PDF`,
                contentType: 'application/pdf'
            });

            if (attachment) {
                Zotero.debug(`Successfully downloaded attachment from ${source}`);
            }
        } catch (error) {
            Zotero.debug(`Failed to download from ${source}: ${error}`);
            throw error;
        }
    };
}

// Ensure Zotero and OS are available, typically provided by the Zotero environment
// For testing, these would be mocked or polyfilled.
if (typeof Zotero === 'undefined') {
  var Zotero = { // Basic mock for structure
    debug: function(msg) { console.log(msg); },
    log: function(msg) { console.log(msg); }
  };
}

// Use global OS if available (for testing), otherwise create a basic mock
if (typeof OS === 'undefined') {
  if (typeof global !== 'undefined' && global.OS) {
    // Use the global OS object (for testing environment)
    var OS = global.OS;
  } else {
    // Create a basic mock for non-test environments
    var OS = {
      File: {
        exists: async function(path) {
          console.warn(`OS.File.exists called with: ${path}. Mock returning false.`);
          return false; // Default to false for safety in a generic mock
        }
      }
    };
  }
}

// For potential use in a CommonJS-like environment if this file were required,
// or for Zotero's own module system.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AttachmentChecker;
}
// If using ES6 modules in Zotero (less common for bootstrap.js context but possible for some files)
// export default AttachmentChecker;
