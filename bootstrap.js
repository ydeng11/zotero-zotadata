const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");

// --- Start of integrated content from attachment-finder.js ---

// AttachmentChecker Class
function AttachmentChecker() {
    this.checkItems = function (items) {
        let results = {};
        for (let item of items) {
            results[item.id] = this.getAttachmentStatus(item);
        }
        this.displayResults(results);
        return results;
    };

    this.getAttachmentStatus = function (item) {
        let attachments = Zotero.Items.get(item.getAttachments());
        if (!attachments.length) {
            return 'missing';
        }
        for (let attachment of attachments) {
            if (attachment.isPDFAttachment() || attachment.isFileAttachment()) {
                let file = attachment.getFile();
                if (file && file.exists()) {
                    return 'valid';
                }
            }
        }
        return 'broken';
    };

    this.displayResults = function (results) {
        let message = "Attachment Status:\\n\\n";
        for (let itemId in results) {
            let item = Zotero.Items.get(itemId);
            message += `${item.getDisplayTitle()}: ${results[itemId]}\\n`;
        }
        // TODO: Replace alert with a more Zotero-idiomatic notification
        alert(message);
    };
}

// DOIExtractor Class
function DOIExtractor() {
    this.extractDOI = function (item) {
        let doi = item.getField('DOI');
        if (doi && this.isValidDOI(doi)) {
            return this.cleanDOI(doi);
        }
        let url = item.getField('url');
        if (url) {
            let doiFromURL = this.extractDOIFromURL(url);
            if (doiFromURL) return doiFromURL;
        }
        let extra = item.getField('extra');
        if (extra) {
            let doiFromExtra = this.extractDOIFromExtra(extra);
            if (doiFromExtra) return doiFromExtra;
        }
        return null;
    };

    this.isValidDOI = function (doi) {
        // Basic DOI regex (simplified) - consider using a more robust one
        return /^10\\.\\d{4,9}\/[-._;()/:A-Z0-9]+$/i.test(doi);
    };

    this.cleanDOI = function (doi) {
        // Remove potential "doi:" prefix and trim whitespace
        return doi.replace(/^doi:/i, '').trim();
    };

    this.extractDOIFromURL = function (url) {
        try {
            const urlObj = new URL(url);
            if (urlObj.hostname.endsWith('doi.org')) {
                let path = urlObj.pathname.substring(1); // Remove leading '/'
                if (this.isValidDOI(path)) {
                    return this.cleanDOI(path);
                }
            }
        } catch (e) {
            // Invalid URL
        }
        // Add more URL patterns if needed (e.g., specific publisher sites)
        const doiOrgRegex = /doi\\.org\\/(10\\.[^\\s]+)/i;
        const dxDoiOrgRegex = /dx\\.doi\\.org\\/(10\\.[^\\s]+)/i;
        const doiMatchers = [
            doiOrgRegex,
            dxDoiOrgRegex,
            // Add more regex patterns for other DOI resolver URLs or publisher specific URLs
        ];
        for (const matcher of doiMatchers) {
            const match = url.match(matcher);
            if (match && match[1] && this.isValidDOI(match[1])) {
                return this.cleanDOI(match[1]);
            }
        }
        return null;
    };

    this.extractDOIFromExtra = function (extra) {
        const lines = extra.split('\n');
        for (let line of lines) {
            if (line.toLowerCase().startsWith('doi:')) {
                let doi = line.substring(4).trim();
                if (this.isValidDOI(doi)) {
                    return this.cleanDOI(doi);
                }
            }
            // Check for raw DOIs as well
             if (this.isValidDOI(line.trim())) {
                return this.cleanDOI(line.trim());
            }
        }
        return null;
    };
}

// MetadataUpdater Class
function MetadataUpdater() {
    this.updateFromDOI = async function (item, doi) {
        Zotero.debug(`Attachment Finder: Updating metadata for item ${item.getID()} using DOI: ${doi}`);
        try {
            // Use Zotero's DOI lookup
            const lookup = new Zotero.Lookup.DOI();
            const newItem = await lookup.translate(doi);

            if (newItem && newItem.itemType) {
                // Merge fields, be careful not to overwrite existing good data without reason
                // This is a simplified merge, a more sophisticated one might be needed
                const fieldsToUpdate = ['title', 'creators', 'date', 'publicationTitle', 'volume', 'issue', 'pages', 'abstractNote', 'url', 'accessDate', 'libraryCatalog', 'archive', 'archiveLocation', 'callNumber', 'series', 'seriesNumber', 'publisher', 'place', 'ISBN', 'ISSN', 'DOI'];

                let changed = false;
                for (const field of fieldsToUpdate) {
                    if (newItem[field] && newItem[field] !== item.getField(field)) {
                        item.setField(field, newItem[field]);
                        changed = true;
                    }
                }

                // Update creators more carefully
                if (newItem.creators && newItem.creators.length > 0) {
                    // Simple replacement for now, consider smarter merging
                    item.setCreators(newItem.creators);
                    changed = true;
                }

                if (changed) {
                    await item.saveTx();
                    Zotero.Notifier.trigger('modify', 'item', [item.id]);
                    Zotero.debug(`Attachment Finder: Metadata updated for item ${item.getID()}`);
                    // Optionally, notify user of success for this item
                } else {
                    Zotero.debug(`Attachment Finder: No metadata changes needed for item ${item.getID()} from DOI ${doi}`);
                }

            } else {
                Zotero.debug(`Attachment Finder: Could not retrieve metadata for DOI: ${doi}`);
                // Optionally, notify user of failure for this item
            }
        } catch (error) {
            Zotero.logError(`Attachment Finder: Error updating metadata from DOI ${doi} for item ${item.getID()}: ${error}`);
            // Optionally, notify user of error for this item
        }
    };
}

// FileDownloader Class
function FileDownloader() {
    this.findAndDownload = async function (item, doi) {
        Zotero.debug(`Attachment Finder: Attempting to find and download for item ${item.getID()}, DOI: ${doi}`);
        // Placeholder for actual download logic (e.g., Unpaywall, Sci-Hub, etc.)
        // This is a complex task and requires careful implementation regarding APIs and ethics.

        // Example: Try Unpaywall
        try {
            const unpaywallUrl = `https://api.unpaywall.org/v2/${doi}?email=YOUR_EMAIL@example.com`; // Replace with actual email
            const response = await Zotero.HTTP.request('GET', unpaywallUrl);
            if (response.status === 200) {
                const data = JSON.parse(response.responseText);
                if (data && data.best_oa_location && data.best_oa_location.url_for_pdf) {
                    const pdfUrl = data.best_oa_location.url_for_pdf;
                    Zotero.debug(`Attachment Finder: Found PDF URL via Unpaywall: ${pdfUrl}`);
                    // Create attachment
                    await Zotero.Attachments.addURLAttachment(item, pdfUrl, { title: `PDF for ${doi}` });
                     Zotero.Notifier.trigger('add', 'item', [item.id]); // Notify UI to refresh
                    Zotero.debug(`Attachment Finder: Attachment added for ${doi}`);
                    return;
                }
            }
        } catch (e) {
            Zotero.logError(`Attachment Finder: Error with Unpaywall for ${doi}: ${e}`);
        }

        // Fallback or other methods can be added here

        Zotero.debug(`Attachment Finder: No PDF found for DOI: ${doi} via implemented methods.`);
        // Optionally notify the user that no PDF was found.
    };
}

// --- End of integrated content from attachment-finder.js ---

var attachmentChecker;
var doiExtractor;
var metadataUpdater;
var fileDownloader;
var chromeHandle;

var AttachmentFinder = {};

// Plugin Lifecycle hooks
function startup({ id, version, rootURI }, reason) {
    Zotero.debug(`Attachment Finder: Starting up (ID: ${id}, Version: ${version}, Reason: ${reason})`);

    var aomStartup = Cc["@mozilla.org/addons/addon-manager-startup;1"].getService(Ci.amIAddonManagerStartup);
    var manifestURI = Services.io.newURI(rootURI + "manifest.json");
    chromeHandle = aomStartup.registerChrome(manifestURI, [
        ["content", "attachment-finder", "content/"], // Though content/attachment-finder.js is now integrated, other resources might be here
        ["skin", "attachment-finder", "skin/default/"],
        ["locale", "attachment-finder", "en-US", "locale/en-US/"],
        ["locale", "attachment-finder", "zh-CN", "locale/zh-CN/"]
    ]);

    // Initialize components
    attachmentChecker = new AttachmentChecker();
    doiExtractor = new DOIExtractor();
    metadataUpdater = new MetadataUpdater();
    fileDownloader = new FileDownloader();

    // Register preferences pane
    if (Zotero.PreferencePanes) {
        Zotero.PreferencePanes.register({
            pluginID: 'attachment-finder@zotero.org',
            src: rootURI + 'chrome/content/preferences.xhtml', // Ensure this path is correct
            label: 'Attachment Finder'
            // Removed 'icon' as it's not a standard Zotero 7 property for panes here
            // Consider adding 'scripts' if preferences.xhtml needs its own JS
        });
         Zotero.debug("Attachment Finder: Preferences pane registered.");
    } else {
        Zotero.debug("Attachment Finder: Zotero.PreferencePanes not available for registration.");
    }

    Zotero.debug("Attachment Finder: Initialized and components loaded.");
}

function shutdown(data, reason) {
    Zotero.debug(`Attachment Finder: Shutting down (Reason: ${reason})`);
    if (reason == APP_SHUTDOWN) return;

    // Cleanup components if needed (e.g., if they hold external resources)
    // For now, they are simple objects and will be garbage collected.

    // Deregister chrome
    if (chromeHandle) {
        chromeHandle.destruct();
        chromeHandle = null;
        Zotero.debug("Attachment Finder: Chrome destructed.");
    }

    // Unregister preference pane (if Zotero provides a mechanism, otherwise it's usually handled by chrome deregistration)
    // Zotero.PreferencePanes.unregister might not be needed or exist in this exact form for Zotero 7.
    // Typically, disabling/uninstalling the addon handles this.
    // If specific unregistration is needed:
    // if (Zotero.PreferencePanes && Zotero.PreferencePanes.unregister) {
    // Zotero.PreferencePanes.unregister('attachment-finder@zotero.org');
    // Zotero.debug("Attachment Finder: Preferences pane unregistered.");
    // }

    // Remove any UI elements or listeners added by onMainWindowLoad
    // This needs to iterate over all open windows if onMainWindowLoad added persistent UI elements
    var windows = Zotero.getMainWindows();
    for (let win of windows) {
        removeEventListeners(win); // Call the refactored listener removal
    }
     Zotero.debug("Attachment Finder: Shutdown complete.");
}

function install(data, reason) {
    Zotero.debug(`Attachment Finder: Installed (Reason: ${reason})`);
    // Post-install logic, e.g., setting default preferences if not already handled by prefs.js
}

function uninstall(data, reason) {
    Zotero.debug(`Attachment Finder: Uninstalled (Reason: ${reason})`);
    // Cleanup any persistent data outside the addon's own directory if necessary
}

// Window hooks
function onMainWindowLoad({ window }) {
    Zotero.debug("Attachment Finder: Main window loaded.");
    setupEventListeners(window);
}

function onMainWindowUnload({ window }) {
    Zotero.debug("Attachment Finder: Main window unloaded.");
    removeEventListeners(window);
}

// Helper functions (formerly part of AttachmentFinder object)
function setupEventListeners(window) {
    var doc = window.document;
    var popup = doc.getElementById('zotero-itemmenu');
    if (popup) {
        // Use a named function for the event listener to allow removal
        popup.addEventListener('popupshowing', onPopupShowingHandler);
        // Store the handler on the window object or a map if you need to track it per window
        // For simplicity, if only one main window is typical, this is okay.
        // If multiple windows, ensure handler reference is managed.
        Zotero.debug("Attachment Finder: Event listeners set up for zotero-itemmenu.");
    } else {
         Zotero.debug("Attachment Finder: zotero-itemmenu not found in this window.");
    }
}
// Named handler function
function onPopupShowingHandler(event){
    // `this` will be the popup element. We need the window context.
    // Find the window associated with the document of the event target.
    const window = event.target.ownerDocument.defaultView;
    if (event.target.id !== 'zotero-itemmenu') return;
    addContextMenuItems(event.target, window);
}

function removeEventListeners(window) {
    var doc = window.document;
    var popup = doc.getElementById('zotero-itemmenu');
    if (popup) {
        popup.removeEventListener('popupshowing', onPopupShowingHandler);
         Zotero.debug("Attachment Finder: Event listeners removed from zotero-itemmenu.");
    }
    // Remove dynamically added menu items
    var existingItems = doc.querySelectorAll('[id^="attachment-finder-"]');
    existingItems.forEach(item => item.remove());
    Zotero.debug("Attachment Finder: Dynamically added menu items removed.");
}

function addContextMenuItems(popup, window) {
    var doc = window.document;

    // Remove existing items to prevent duplication if popupshowing fires multiple times before items are used
    let existingItems = popup.querySelectorAll('[id^="attachment-finder-"]');
    existingItems.forEach(item => item.remove());

    let separator = doc.createXULElement('menuseparator');
    separator.id = 'attachment-finder-separator';
    popup.appendChild(separator);

    let checkItem = doc.createXULElement('menuitem');
    checkItem.id = 'attachment-finder-check';
    checkItem.setAttribute('label', 'Check Attachments (AF)'); // Added (AF) for clarity during dev
    checkItem.addEventListener('command', () => doCheckAttachments(window));
    popup.appendChild(checkItem);

    let updateItem = doc.createXULElement('menuitem');
    updateItem.id = 'attachment-finder-update';
    updateItem.setAttribute('label', 'Update Metadata from DOI (AF)');
    updateItem.addEventListener('command', () => doUpdateMetadata(window));
    popup.appendChild(updateItem);

    let downloadItem = doc.createXULElement('menuitem');
    downloadItem.id = 'attachment-finder-download';
    downloadItem.setAttribute('label', 'Find Missing Files (AF)');
    downloadItem.addEventListener('command', () => doFindMissingFiles(window));
    popup.appendChild(downloadItem);

    let settingsItem = doc.createXULElement('menuitem');
    settingsItem.id = 'attachment-finder-settings';
    settingsItem.setAttribute('label', 'Attachment Finder Settings (AF)');
    settingsItem.addEventListener('command', () => doOpenSettings(window));
    popup.appendChild(settingsItem);
    Zotero.debug("Attachment Finder: Context menu items added.");
}

// Action functions (formerly part of AttachmentFinder, now standalone or could be methods of the classes if more complex)
function doCheckAttachments(window) {
    let selectedItems = window.ZoteroPane.getSelectedItems();
    if (!selectedItems || !selectedItems.length) {
        // TODO: Use Zotero.Notifier.show() for alerts
        alert('Please select items to check attachments.');
        return;
    }
    attachmentChecker.checkItems(selectedItems);
}

async function doUpdateMetadata(window) {
    let selectedItems = window.ZoteroPane.getSelectedItems();
    if (!selectedItems || !selectedItems.length) {
        alert('Please select items to update metadata.');
        return;
    }
    for (let item of selectedItems) {
        try {
            let doi = doiExtractor.extractDOI(item);
            if (doi) {
                Zotero.showZoteroPaneProgressMeter(`Updating metadata for ${item.getDisplayTitle()}...`);
                await metadataUpdater.updateFromDOI(item, doi);
            } else {
                Zotero.debug(`Attachment Finder: No DOI found for item ${item.getID()} to update metadata.`);
            }
        } catch (error) {
            Zotero.logError(`Attachment Finder: Error processing item ${item.getID()} for metadata update: ${error}`);
        } finally {
            Zotero.hideZoteroPaneProgressMeter();
        }
    }
    alert('Metadata update process completed. Check Debug Output for details.'); // Replace with better notification
}

async function doFindMissingFiles(window) {
    let selectedItems = window.ZoteroPane.getSelectedItems();
    if (!selectedItems || !selectedItems.length) {
        alert('Please select items to find missing files.');
        return;
    }
     for (let item of selectedItems) {
        try {
            let status = attachmentChecker.getAttachmentStatus(item);
            if (status === 'missing') {
                let doi = doiExtractor.extractDOI(item);
                if (doi) {
                    Zotero.showZoteroPaneProgressMeter(`Finding files for ${item.getDisplayTitle()}...`);
                    await fileDownloader.findAndDownload(item, doi);
                } else {
                     Zotero.debug(`Attachment Finder: No DOI found for item ${item.getID()} to find missing files.`);
                }
            } else {
                 Zotero.debug(`Attachment Finder: Item ${item.getID()} does not have 'missing' attachment status (${status}). Skipping download search.`);
            }
        } catch (error) {
            Zotero.logError(`Attachment Finder: Error processing item ${item.getID()} for file download: ${error}`);
        } finally {
            Zotero.hideZoteroPaneProgressMeter();
        }
    }
    alert('File finding process completed. Check Debug Output for details.'); // Replace with better notification
}

function doOpenSettings(window) {
    if (window.ZoteroPane && window.ZoteroPane.openPreferences) {
        window.ZoteroPane.openPreferences('attachment-finder@zotero.org');
         Zotero.debug("Attachment Finder: Opening preferences to specific pane.");
    } else {
        // Fallback for older versions or different Zotero contexts if necessary
        window.openDialog('chrome://zotero/content/preferences/preferences.xul',
            'zotero-prefs',
            'chrome,titlebar,toolbar,centerscreen,modal',
            { paneID: 'attachment-finder@zotero.org' } // Pass paneID as argument
        );
        Zotero.debug("Attachment Finder: Opening preferences via openDialog fallback.");
    }
}
