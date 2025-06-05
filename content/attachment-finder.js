/**
 * Zotero Attachment Finder - Main Script
 * Handles attachment validation, DOI extraction, metadata updates, and file downloads
 */

// Add immediate logging to see if script is loaded
Zotero.log("AttachmentFinder: Script loading started");

class AttachmentChecker {
    /**
     * Processes attachments for a single Zotero item.
     * It checks file-type attachments for existence and removes those that are invalid
     * (missing path or file not found on disk).
     * @param {Object} item - The Zotero item object.
     * @returns {Promise<Object>} An object containing the finalStatus for the item
     *                            and details of processed attachments.
     */
    async processItemAttachments(item) {
        Zotero.log(`AttachmentFinder: Processing attachments for item ID ${item.id}`);
        if (!item || typeof item.getAttachmentsObjects !== 'function') {
            Zotero.log(`AttachmentFinder: Invalid item or getAttachmentsObjects not found for item ID ${item.id}`);
            return { finalStatus: 'error', details: [{ error: 'Invalid item object' }] };
        }

        let attachments;
        try {
            attachments = await item.getAttachmentsObjects();
        } catch (e) {
            Zotero.log(`AttachmentFinder: Error getting attachment objects for item ID ${item.id}: ${e}`);
            return { finalStatus: 'error', details: [{ error: `Failed to get attachments: ${e.toString()}` }] };
        }

        const details = [];
        let hasValidFileAttachment = false;
        let hadFileAttachments = false; // To track if item was supposed to have files

        if (!attachments || attachments.length === 0) {
            Zotero.log(`AttachmentFinder: No attachments found for item ID ${item.id}`);
            return { finalStatus: 'missing', details: [] };
        }

        for (const attachment of attachments) {
            if (!attachment || !attachment.id) {
                Zotero.log(`AttachmentFinder: Invalid attachment object found for item ID ${item.id}`);
                details.push({ attachmentID: 'unknown', path: 'unknown', filename: 'N/A', status: 'invalid_object', action: 'skipped' });
                continue;
            }

            let fn = 'N/A';
            if (attachment.path) {
                let p = attachment.path;
                let slashIdx = p.lastIndexOf('/');
                let backslashIdx = p.lastIndexOf('\\'); // Escaped backslash for string literal
                let idx = Math.max(slashIdx, backslashIdx);
                if (idx === -1 && p.length > 0) { // Handles case where path is just a filename
                    fn = p;
                } else if (idx > -1) {
                    fn = p.substring(idx + 1);
                }
            }
            const filename = fn;

            Zotero.log(`AttachmentFinder: Checking attachment ID ${attachment.id} for item ID ${item.id}. LinkMode: ${attachment.attachmentLinkMode}, Path: ${attachment.path}`);

            const isImportedFile = attachment.attachmentLinkMode === Zotero.Attachments.LINK_MODE_IMPORTED_FILE;
            const isLinkedFile = attachment.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_FILE;

            if (isImportedFile || isLinkedFile) {
                hadFileAttachments = true;
                if (!attachment.path) {
                    Zotero.log(`AttachmentFinder: Attachment ID ${attachment.id} (file type) has no path. Removing.`);
                    try {
                        await attachment.eraseTx();
                        details.push({ attachmentID: attachment.id, path: null, filename, status: 'no_path', action: 'removed' });
                    } catch (e) {
                        Zotero.log(`AttachmentFinder: Error removing attachment ID ${attachment.id} (no path): ${e}`);
                        details.push({ attachmentID: attachment.id, path: null, filename, status: 'no_path', action: 'remove_failed', error: e.toString() });
                    }
                } else {
                    try {
                        const fileExists = await OS.File.exists(attachment.path);
                        if (fileExists) {
                            Zotero.log(`AttachmentFinder: File exists for attachment ID ${attachment.id} at path ${attachment.path}.`);
                            hasValidFileAttachment = true;
                            details.push({ attachmentID: attachment.id, path: attachment.path, filename, status: 'valid_file', action: 'kept' });
                        } else {
                            Zotero.log(`AttachmentFinder: File does not exist for attachment ID ${attachment.id} at path ${attachment.path}. Removing.`);
                            await attachment.eraseTx();
                            details.push({ attachmentID: attachment.id, path: attachment.path, filename, status: 'file_not_found', action: 'removed' });
                        }
                    } catch (e) {
                        Zotero.log(`AttachmentFinder: Error checking/removing attachment ID ${attachment.id} for path ${attachment.path}: ${e}`);
                        details.push({ attachmentID: attachment.id, path: attachment.path, filename, status: 'check_error', action: 'skipped', error: e.toString() });
                    }
                }
            } else {
                Zotero.log(`AttachmentFinder: Attachment ID ${attachment.id} is not an imported/linked file (LinkMode: ${attachment.attachmentLinkMode}). Skipping file check.`);
                details.push({ attachmentID: attachment.id, path: attachment.path, filename, status: 'non_file_type', action: 'skipped' });
            }
        }

        let finalStatus;
        if (hasValidFileAttachment) {
            finalStatus = 'valid';
        } else {
            let remainingAttachmentsAfterProcessing;
            try {
                remainingAttachmentsAfterProcessing = await item.getAttachmentsObjects();
            } catch (e) {
                Zotero.log(`AttachmentFinder: Could not re-fetch attachments for item ${item.id} to determine final status precisely: ${e}`);
                // Base status on initial assessment if re-fetch fails
                finalStatus = hadFileAttachments ? 'broken_or_missing_files' : 'missing';
            }

            if (remainingAttachmentsAfterProcessing) {
                if (remainingAttachmentsAfterProcessing.length === 0) {
                    finalStatus = 'missing'; // All attachments removed or none to begin with
                } else {
                    // Check if any remaining are non-file types (e.g. URL, snapshot)
                    const hasNonFileAttachments = remainingAttachmentsAfterProcessing.some(att =>
                        !(att.attachmentLinkMode === Zotero.Attachments.LINK_MODE_IMPORTED_FILE ||
                          att.attachmentLinkMode === Zotero.Attachments.LINK_MODE_LINKED_FILE)
                    );
                    if (hasNonFileAttachments) {
                        finalStatus = 'no_valid_files_but_other_attachments_present';
                    } else {
                        // Remaining are file types, but none were valid (implies errors or all broken)
                        finalStatus = 'broken_files_remaining_or_errors';
                    }
                }
            } else if (!finalStatus) { // if remainingAttachmentsAfterProcessing is null and finalStatus not set
                 finalStatus = hadFileAttachments ? 'broken_or_missing_files' : 'missing';
            }
        }

        Zotero.log(`AttachmentFinder: Finished processing item ID ${item.id}. Final status: ${finalStatus}. Details: ` + JSON.stringify(details));
        return { finalStatus, details };
    }

    /**
     * Checks a list of Zotero items and returns their attachment statuses after processing.
     * @param {Array<Object>} items - An array of Zotero item objects.
     * @returns {Promise<Array<Object>>} An array of objects, each containing the itemID,
     *                                   its attachment status, original item, and processing details.
     */
    async checkItems(items) {
        if (!Array.isArray(items)) {
            return [];
        }

        const results = [];
        for (const item of items) {
            const processingReport = await this.processItemAttachments(item);
            results.push({
                itemID: item.id || item.key || null,
                status: processingReport.finalStatus,
                item: item, // Keep reference to original item
                details: processingReport.details
            });
        }
        return results;
    }

    /**
     * Checks items and displays results to the user.
     * This is the method called from the UI.
     * @param {Array<Object>} items - Array of Zotero item objects
     */
    async checkItemsAndDisplay(items) {
        try {
            const results = await this.checkItems(items);
            this.displayResults(results);
            return results;
        } catch (error) {
            Zotero.log(`Error checking attachments: ${error}`);
            alert(`Error checking attachments: ${error.message}`);
            return [];
        }
    }

    /**
     * Displays attachment check results to the user.
     * @param {Array<Object>} results - Results from checkItems()
     */
    displayResults(results) {
        if (!results || results.length === 0) {
            alert('No items to check or process.');
            return;
        }

        let message = "Attachment Processing Report:\n\n";
        const summaryCounts = {
            valid: 0,
            missing: 0,
            no_valid_files: 0,
            broken_or_errors: 0,
            error_item: 0,
            attachments_removed: 0,
            attachments_kept: 0,
            attachments_skipped_type: 0,
            attachments_skipped_errors: 0
        };

        for (const result of results) {
            const item = result.item;
            const title = item.getDisplayTitle ? item.getDisplayTitle() :
                         (item.getField ? item.getField('title') : 'Unknown Item');
            const itemStatus = result.status;

            let itemSymbol = '?';
            switch (itemStatus) {
                case 'valid':
                    itemSymbol = '✅';
                    summaryCounts.valid++;
                    break;
                case 'missing':
                    itemSymbol = '🗑️';
                    summaryCounts.missing++;
                    break;
                case 'no_valid_files_but_other_attachments_present':
                    itemSymbol = '🔗';
                    summaryCounts.no_valid_files++;
                    break;
                case 'broken_files_remaining_or_errors':
                case 'broken_or_missing_files': // Grouping these as generally problematic
                    itemSymbol = '⚠️';
                    summaryCounts.broken_or_errors++;
                    break;
                case 'error': // Error processing the item itself
                    itemSymbol = '🚫';
                    summaryCounts.error_item++;
                    break;
                default:
                    itemSymbol = '❔';
                    Zotero.log(`AttachmentFinder: Unknown item status in displayResults: ${itemStatus}`);
                    summaryCounts.broken_or_errors++; // Add to a general problematic category
                    break;
            }
            message += `${itemSymbol} ${title}: ${itemStatus.replace(/_/g, ' ').toUpperCase()}\n`;

            if (result.details && result.details.length > 0) {
                for (const detail of result.details) {
                    message += `  Attachment ID: ${detail.attachmentID || 'N/A'}`;
                    if (detail.filename && detail.filename !== 'N/A') message += `, File: ${detail.filename}`;
                    else if (detail.path) message += `, Path: ${detail.path}`;
                    message += `, Status: ${detail.status.replace(/_/g, ' ')}`;
                    if (detail.action) message += `, Action: ${detail.action.replace(/_/g, ' ')}`;
                    if (detail.error) message += `, Error: ${detail.error}`;
                    message += `\n`;

                    if (detail.action === 'removed') summaryCounts.attachments_removed++;
                    else if (detail.action === 'kept') summaryCounts.attachments_kept++;
                    else if (detail.action === 'skipped' && detail.status === 'non_file_type') summaryCounts.attachments_skipped_type++;
                    else if (detail.action === 'skipped' && (detail.status === 'check_error' || detail.status === 'invalid_object')) summaryCounts.attachments_skipped_errors++;
                }
            }
            message += `\n`;
        }

        message += `\n--- Summary ---\n`;
        message += `Total items processed: ${results.length}\n`;
        message += `✅ Items with valid file attachments: ${summaryCounts.valid}\n`;
        message += `🗑️ Items with no attachments (or all problematic files removed): ${summaryCounts.missing}\n`;
        message += `🔗 Items with non-file attachments but no valid files: ${summaryCounts.no_valid_files}\n`;
        message += `⚠️ Items with broken/missing files or processing issues: ${summaryCounts.broken_or_errors}\n`;
        if (summaryCounts.error_item > 0) {
            message += `🚫 Items with critical processing errors: ${summaryCounts.error_item}\n`;
        }
        message += `\n--- Attachment Actions ---\n`;
        message += `Attachments removed: ${summaryCounts.attachments_removed}\n`;
        message += `Attachments kept (valid files): ${summaryCounts.attachments_kept}\n`;
        message += `Attachments skipped (non-file types): ${summaryCounts.attachments_skipped_type}\n`;
        if (summaryCounts.attachments_skipped_errors > 0) {
            message += `Attachments skipped due to errors/issues: ${summaryCounts.attachments_skipped_errors}\n`;
        }

        alert(message);
    }
}

AttachmentFinder = {
    initialized: false,

    init: function () {
        Zotero.log("AttachmentFinder: init() called");
        if (this.initialized) {
            Zotero.log("AttachmentFinder: Already initialized, skipping");
            return;
        }

        // Initialize components
        this.attachmentChecker = new AttachmentChecker();
        this.doiExtractor = new DOIExtractor();
        this.metadataUpdater = new MetadataUpdater();
        this.fileDownloader = new FileDownloader();

        this.initialized = true;
        Zotero.log("Attachment Finder: Initialized successfully");
    },

    shutdown: function () {
        // Cleanup logic
        this.initialized = false;
        Zotero.log("Attachment Finder: Shutdown");
    },

    onMainWindowLoad: function (window) {
        // Setup UI for this window
        this.setupEventListeners(window);
        Zotero.log("Attachment Finder: Window loaded");
    },

    onMainWindowUnload: function (window) {
        // Cleanup for this window
        this.removeEventListeners(window);
        Zotero.log("Attachment Finder: Window unloaded");
    },

    setupEventListeners: function (window) {
        Zotero.log("AttachmentFinder: setupEventListeners called for window");
        // Add context menu items dynamically
        var doc = window.document;
        var popup = doc.getElementById('zotero-itemmenu');
        if (popup) {
            Zotero.log("AttachmentFinder: Found zotero-itemmenu, adding event listener");
            popup.addEventListener('popupshowing', (event) => {
                this.onPopupShowing(event, window);
            });
        } else {
            Zotero.log("AttachmentFinder: ERROR - Could not find zotero-itemmenu popup");
        }
    },

    removeEventListeners: function (window) {
        // Remove our additions
        var doc = window.document;
        var existingItems = doc.querySelectorAll('[id^="attachment-finder-"]');
        existingItems.forEach(item => item.remove());
    },

    onPopupShowing: function (event, window) {
        Zotero.log("AttachmentFinder: onPopupShowing called, target ID: " + event.target.id);
        if (event.target.id !== 'zotero-itemmenu') return;

        // Add menu items dynamically
        this.addContextMenuItems(event.target, window);
    },

    addContextMenuItems: function (popup, window) {
        Zotero.log("AttachmentFinder: addContextMenuItems called");
        var doc = window.document;

        // Remove existing items
        let existingItems = popup.querySelectorAll('[id^="attachment-finder-"]');
        Zotero.log("AttachmentFinder: Removing " + existingItems.length + " existing menu items");
        existingItems.forEach(item => item.remove());

        // Create separator
        let separator = doc.createXULElement('menuseparator');
        separator.id = 'attachment-finder-separator';
        popup.appendChild(separator);
        Zotero.log("AttachmentFinder: Added separator");

        // Check Attachments
        let checkItem = doc.createXULElement('menuitem');
        checkItem.id = 'attachment-finder-check';
        checkItem.setAttribute('label', 'Check Attachments');
        checkItem.addEventListener('command', () => {
            Zotero.log("AttachmentFinder: Check Attachments menu item clicked");
            this.checkAttachments(window);
        });
        popup.appendChild(checkItem);
        Zotero.log("AttachmentFinder: Added Check Attachments menu item");

        // Update Metadata
        let updateItem = doc.createXULElement('menuitem');
        updateItem.id = 'attachment-finder-update';
        updateItem.setAttribute('label', 'Update Metadata from DOI');
        updateItem.addEventListener('command', () => {
            Zotero.log("AttachmentFinder: Update Metadata menu item clicked");
            this.updateMetadata(window);
        });
        popup.appendChild(updateItem);

        // Find Missing Files
        let downloadItem = doc.createXULElement('menuitem');
        downloadItem.id = 'attachment-finder-download';
        downloadItem.setAttribute('label', 'Find Missing Files');
        downloadItem.addEventListener('command', () => {
            Zotero.log("AttachmentFinder: Find Missing Files menu item clicked");
            this.findMissingFiles(window);
        });
        popup.appendChild(downloadItem);

        // Settings
        let settingsItem = doc.createXULElement('menuitem');
        settingsItem.id = 'attachment-finder-settings';
        settingsItem.setAttribute('label', 'Attachment Finder Settings');
        settingsItem.addEventListener('command', () => {
            Zotero.log("AttachmentFinder: Settings menu item clicked");
            this.openSettings(window);
        });
        popup.appendChild(settingsItem);

        Zotero.log("AttachmentFinder: All menu items added successfully");
    },

    // Main functionality methods
    checkAttachments: async function (window) {
        Zotero.log("AttachmentFinder: checkAttachments function called");
        let selectedItems = window.ZoteroPane.getSelectedItems();
        Zotero.log("AttachmentFinder: Selected items count: " + selectedItems.length);
        if (!selectedItems.length) {
            Zotero.log("AttachmentFinder: No items selected");
            alert('Please select items to check attachments.');
            return;
        }

        Zotero.log("AttachmentFinder: Starting attachment check for " + selectedItems.length + " items");
        await this.attachmentChecker.checkItemsAndDisplay(selectedItems);
        Zotero.log("AttachmentFinder: Attachment check completed");
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
                Zotero.log("Error updating metadata for item: " + error);
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
                Zotero.log("Error downloading file for item: " + error);
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
                Zotero.log(`Updated metadata for item: ${item.getDisplayTitle()}`);
            }
        } catch (error) {
            Zotero.log(`Failed to update metadata: ${error}`);
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
            Zotero.log(`CrossRef API error: ${error}`);
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

            Zotero.log(`No open access files found for DOI: ${doi}`);
        } catch (error) {
            Zotero.log(`Error in file download: ${error}`);
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
            Zotero.log(`Unpaywall API error: ${error}`);
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
            Zotero.log(`arXiv API error: ${error}`);
        }

        return null;
    };

    this.downloadFile = async function (item, url, source) {
        try {
            Zotero.log(`Downloading file from ${source}: ${url}`);

            // Create attachment
            let attachment = await Zotero.Attachments.importFromURL({
                url: url,
                parentItemID: item.id,
                title: `${source} PDF`,
                contentType: 'application/pdf'
            });

            if (attachment) {
                Zotero.log(`Successfully downloaded attachment from ${source}`);
            }
        } catch (error) {
            Zotero.log(`Failed to download from ${source}: ${error}`);
            throw error;
        }
    };
}

// Ensure Zotero and OS are available, typically provided by the Zotero environment
// For testing, these would be mocked or polyfilled.
if (typeof Zotero === 'undefined') {
  var Zotero = { // Basic mock for structure
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
