// Zotadata: Enhanced metadata management for Zotero
Zotero.log("Zotadata: Script loading started");

function _create(doc, name) {
    const elt =
        Zotero.platformMajorVersion >= 102
            ? doc.createXULElement(name)
            : doc.createElementNS(
                "http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul",
                name
            );
    return elt;
}

/*
 * DOWNLOAD FIXES IMPLEMENTED:
 * 
 * 1. SELECTIVE DOWNLOADING: Only download when needed
 *    - Check if item already has valid PDF before downloading
 *    - Only download when changing item types (arXiv → published)
 *    - Respect existing attachments to avoid duplicates
 * 
 * 2. STORED FILE ATTACHMENTS: Always create stored files, never links
 *    - Primary method: Zotero.Attachments.importFromURL for stored files
 *    - Fallback method: Manual download + importFromFile for stored files
 *    - Eliminates link attachments - all downloads create local stored files
 * 
 * 3. IMPROVED DOWNLOAD METHOD: Fixed NetUtil errors
 *    - Use proper Zotero 7 attachment methods
 *    - Manual download fallback using HTTP request + temp file
 *    - Proper URL validation before download attempts
 * 
 * 4. BETTER ERROR HANDLING:
 *    - Validate URLs before attempting downloads
 *    - Multiple fallback methods for attachment creation
 *    - Detailed logging for debugging download issues
 *    - Automatic temp file cleanup
 * 
 * 5. FILENAME SANITIZATION:
 *    - Clean filenames to prevent filesystem issues
 *    - Handle special characters and length limits
 */

Zotadata = {
    id: null,
    version: null,
    rootURI: null,
    addedElementIDs: [],
    notifierID: null,

    log(msg) {
        Zotero.log("Zotadata: " + msg);
    },

    // Startup - initialize plugin
    init({ id, version, rootURI } = {}) {
        this.log("init() called");

        this.id = id;
        this.version = version;
        this.rootURI = rootURI;

        this.log("Initialized successfully");
    },

    // Overlay management
    addToWindow(window) {
        this.log("Adding to window");

        try {
            let doc = window.document;

            // Item menu
            let itemmenu = _create(doc, "menu");
            itemmenu.id = "zotero-itemmenu-zotadata-menu";
            itemmenu.setAttribute("class", "menu-iconic");
            itemmenu.setAttribute("label", "Zotadata");

            let itemmenupopup = _create(doc, "menupopup");
            itemmenupopup.id = "zotero-itemmenu-zotadata-menupopup";

            let checkAttachments = _create(doc, "menuitem");
            checkAttachments.id = "zotero-itemmenu-zotadata-validate-references";
            checkAttachments.setAttribute("label", "Validate References");
            checkAttachments.addEventListener("command", () => {
                this.log("Validate References menu item clicked");
                Zotadata.checkSelectedItems();
            });

            let fetchMetadata = _create(doc, "menuitem");
            fetchMetadata.id = "zotero-itemmenu-zotadata-update-metadata";
            fetchMetadata.setAttribute("label", "Update Metadata");
            fetchMetadata.addEventListener("command", () => {
                this.log("Update Metadata menu item clicked");
                Zotadata.fetchMetadataForSelectedItems();
            });

            let processArxiv = _create(doc, "menuitem");
            processArxiv.id = "zotero-itemmenu-zotadata-process-preprints";
            processArxiv.setAttribute("label", "Process Preprints");
            processArxiv.addEventListener("command", () => {
                this.log("Process Preprints menu item clicked");
                Zotadata.processArxivItems();
            });

            let findFiles = _create(doc, "menuitem");
            findFiles.id = "zotero-itemmenu-zotadata-retrieve-files";
            findFiles.setAttribute("label", "Retrieve Files");
            findFiles.addEventListener("command", () => {
                this.log("Retrieve Files menu item clicked");
                Zotadata.findSelectedFiles();
            });

            let separator = _create(doc, "menuseparator");
            separator.id = "zotero-itemmenu-zotadata-separator";

            let preferences = _create(doc, "menuitem");
            preferences.id = "zotero-itemmenu-zotadata-preferences";
            preferences.setAttribute("label", "Configure Email");
            preferences.addEventListener("command", () => {
                this.log("Configure Email menu item clicked");
                Zotadata.configureEmail();
            });

            itemmenupopup.appendChild(checkAttachments);
            itemmenupopup.appendChild(fetchMetadata);
            itemmenupopup.appendChild(processArxiv);
            itemmenupopup.appendChild(findFiles);
            itemmenupopup.appendChild(separator);
            itemmenupopup.appendChild(preferences);
            itemmenu.appendChild(itemmenupopup);

            let parentMenu = doc.getElementById("zotero-itemmenu");
            if (parentMenu) {
                parentMenu.appendChild(itemmenu);
                this.storeAddedElement(itemmenu);
                this.storeAddedElement(checkAttachments);
                this.storeAddedElement(fetchMetadata);
                this.storeAddedElement(processArxiv);
                this.storeAddedElement(findFiles);
                this.storeAddedElement(separator);
                this.storeAddedElement(preferences);
                this.log("Successfully added menu to window");
            } else {
                this.log("Error: Could not find zotero-itemmenu parent element");
            }
        } catch (error) {
            this.log("Error in addToWindow: " + error);
        }
    },

    addToAllWindows() {
        this.log("addToAllWindows called");
        try {
            var windows = Zotero.getMainWindows();
            this.log("Found " + windows.length + " windows");
            for (let win of windows) {
                if (!win.ZoteroPane) {
                    this.log("Skipping window without ZoteroPane");
                    continue;
                }
                this.log("Adding to window with ZoteroPane");
                this.addToWindow(win);
            }
        } catch (error) {
            this.log("Error in addToAllWindows: " + error);
        }
    },

    storeAddedElement(elem) {
        try {
            if (!elem.id) {
                throw new Error("Element must have an id");
            }
            this.addedElementIDs.push(elem.id);
            this.log("Stored element with ID: " + elem.id);
        } catch (error) {
            this.log("Error storing element: " + error);
        }
    },

    removeFromWindow(window) {
        this.log("removeFromWindow called");
        try {
            var doc = window.document;
            // Remove all elements added to DOM
            for (let id of this.addedElementIDs) {
                let elem = doc.getElementById(id);
                if (elem) {
                    elem.remove();
                    this.log("Removed element: " + id);
                }
            }
        } catch (error) {
            this.log("Error in removeFromWindow: " + error);
        }
    },

    removeFromAllWindows() {
        this.log("removeFromAllWindows called");
        try {
            var windows = Zotero.getMainWindows();
            for (let win of windows) {
                if (!win.ZoteroPane) continue;
                this.removeFromWindow(win);
            }
        } catch (error) {
            this.log("Error in removeFromAllWindows: " + error);
        }
    },

    // Menu action handlers
    async checkSelectedItems() {
        this.log("checkSelectedItems called");
        let selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
        this.log("Selected items count: " + selectedItems.length);

        if (!selectedItems.length) {
            this.log("No items selected");
            this.showDialog('Please select items to check attachments.');
            return;
        }

        // Use the modular batch processor
        let batchResult = await this.processBatch(
            selectedItems,
            (item) => this.simpleAttachmentCheckBatch(item),
            {
                batchSize: 5,
                delayBetweenBatches: 100,
                progressTitle: "Checking Attachments",
                progressThreshold: 10
            }
        );

        if (!batchResult.success) {
            this.showDialog("Error during batch processing: " + batchResult.error);
            return;
        }

        // Aggregate attachment-specific statistics
        let totalStats = {
            valid: 0,
            removed: 0,
            weblinks: 0,
            processed: batchResult.totalProcessed,
            errors: batchResult.errorCount
        };

        // Sum up attachment stats from successful results
        for (let result of batchResult.results) {
            if (result.result) {
                totalStats.valid += result.result.valid || 0;
                totalStats.removed += result.result.removed || 0;
                totalStats.weblinks += result.result.weblinks || 0;
            }
        }

        // Show attachment-specific summary
        this.showBatchSummary(totalStats, selectedItems.length);
    },

    // Show dialog using Zotero's system
    showDialog(message) {
        try {
            // Try Zotero's internal popup notification first (safest)
            if (typeof Zotero.Notifier !== 'undefined' && typeof Zotero.getMainWindow === 'function') {
                let window = Zotero.getMainWindow();
                if (window && window.ZoteroPane && window.ZoteroPane.displayCannotEditLibraryMessage) {
                    // Use Zotero's popup system
                    this.showZoteroPopup(message);
                    return;
                }
            }

            // Try direct console + log for now
            this.log("=== ZOTADATA RESULT ===");
            this.log(message.replace(/\n/g, ' | '));
            this.log("================================");
            
            // Try to show in Zotero's error console if available
            if (typeof Zotero !== 'undefined' && Zotero.debug) {
                Zotero.debug("Zotadata: " + message);
            }

        } catch (error) {
            this.log("Error showing dialog: " + error);
            this.log("Dialog message: " + message);
        }
    },

    // Show a temporary popup using Zotero's UI
    showZoteroPopup(message) {
        try {
            // Create a larger notification-style message
            let window = Zotero.getMainWindow();
            if (window && window.document) {
                // Create progress window with more space
                let progressWindow = new window.Zotero.ProgressWindow({ 
                    closeOnClick: true,
                    minWidth: 400,
                    minHeight: 200
                });
                
                progressWindow.changeHeadline("Zotadata Results");
                
                // Split message into lines for better display
                let lines = message.split('\n').filter(line => line.trim());
                
                // Create multiple progress items for each line
                let progressItems = [];
                for (let i = 0; i < Math.min(lines.length, 6); i++) { // Limit to 6 lines
                    let progress = new progressWindow.ItemProgress();
                    progress.setProgress(100);
                    progress.setText(lines[i]);
                    progressItems.push(progress);
                }
                
                // If there's only one meaningful line, make it larger
                if (progressItems.length === 1) {
                    progressItems[0].setText(message.replace(/\n/g, ' • '));
                }
                
                progressWindow.show();
                
                // Auto-close after 8 seconds (longer for reading)
                setTimeout(() => {
                    try {
                        progressWindow.close();
                    } catch (e) {
                        // Ignore close errors
                    }
                }, 8000);
                
                this.log("Showed popup notification with " + progressItems.length + " lines");
            }
        } catch (error) {
            this.log("Error showing popup: " + error);
            this.log("Message: " + message);
        }
    },

    // Simple attachment check (now async for eraseTx)
    async simpleAttachmentCheck(item) {
        this.log(`Checking attachments for item ID ${item.id}`);

        try {
            let attachments = item.getAttachments();
            this.log(`Found ${attachments.length} attachments`);

            if (attachments.length === 0) {
                this.showDialog("⚠️ Item has no attachments");
                return;
            }

            let validCount = 0;
            let removedCount = 0;
            let keptWeblinks = 0;

            for (let attachmentID of attachments) {
                this.log(`Processing attachment ID: ${attachmentID}`);
                let attachment = Zotero.Items.get(attachmentID);

                if (!attachment) {
                    this.log(`Warning: Could not get attachment object for ID ${attachmentID}`);
                    continue;
                }

                // Get attachment type
                let linkMode = attachment.attachmentLinkMode;
                this.log(`Attachment ${attachmentID} linkMode: ${linkMode}`);

                // Check if it's a weblink (URL attachment)
                if (linkMode === Zotero.Attachments.LINK_MODE_LINKED_URL) {
                    this.log(`Attachment ${attachmentID} is a weblink - keeping it`);
                    keptWeblinks++;
                    validCount++;
                    continue;
                }

                // Check if it's a file attachment (imported or linked file)
                if (linkMode === Zotero.Attachments.LINK_MODE_IMPORTED_FILE ||
                    linkMode === Zotero.Attachments.LINK_MODE_LINKED_FILE) {

                    this.log(`Attachment ${attachmentID} is a file attachment`);

                    // Check if file exists
                    try {
                        let filePath = attachment.getFilePath();
                        if (!filePath) {
                            this.log(`Attachment ${attachmentID} has no file path - removing`);
                            await attachment.eraseTx();
                            removedCount++;
                            continue;
                        }

                        this.log(`Checking if file exists: ${filePath}`);
                        let file = attachment.getFile();

                        if (file && file.exists()) {
                            this.log(`File exists for attachment ${attachmentID} - keeping it`);
                            validCount++;
                        } else {
                            this.log(`File does not exist for attachment ${attachmentID} - removing it`);
                            await attachment.eraseTx();
                            removedCount++;
                        }

                    } catch (fileError) {
                        this.log(`Error checking file for attachment ${attachmentID}: ${fileError} - removing it`);
                        try {
                            await attachment.eraseTx();
                            removedCount++;
                        } catch (eraseError) {
                            this.log(`Error removing attachment ${attachmentID}: ${eraseError}`);
                        }
                    }
                } else {
                    this.log(`Attachment ${attachmentID} is unknown type (linkMode: ${linkMode}) - keeping it`);
                    validCount++;
                }
            }

            // Show summary
            let message = `Attachment Check Results:\n\n`;
            message += `✅ Valid attachments: ${validCount}\n`;
            if (keptWeblinks > 0) {
                message += `🔗 Weblinks kept: ${keptWeblinks}\n`;
            }
            if (removedCount > 0) {
                message += `🗑️ Broken files removed: ${removedCount}\n`;
            }

            if (validCount === 0) {
                message += `\n⚠️ This item has no valid attachments`;
            } else {
                message += `\n✅ This item has valid attachments`;
            }

            this.log(message.replace(/\n/g, ' '));
            this.showDialog(message);

        } catch (error) {
            this.log("Error in simpleAttachmentCheck: " + error);
            this.showDialog("Error checking attachments: " + error);
        }
    },

    // Batch attachment check (doesn't show individual popups)
    async simpleAttachmentCheckBatch(item) {
        this.log(`Batch checking attachments for item ID ${item.id}`);

        try {
            let attachments = item.getAttachments();
            this.log(`Found ${attachments.length} attachments`);

            let stats = {
                valid: 0,
                removed: 0,
                weblinks: 0,
                processed: 1,
                errors: 0
            };

            if (attachments.length === 0) {
                return stats;
            }

            for (let attachmentID of attachments) {
                this.log(`Processing attachment ID: ${attachmentID}`);
                let attachment = Zotero.Items.get(attachmentID);

                if (!attachment) {
                    this.log(`Warning: Could not get attachment object for ID ${attachmentID}`);
                    continue;
                }

                // Get attachment type
                let linkMode = attachment.attachmentLinkMode;
                this.log(`Attachment ${attachmentID} linkMode: ${linkMode}`);

                // Check if it's a weblink (URL attachment)
                if (linkMode === Zotero.Attachments.LINK_MODE_LINKED_URL) {
                    this.log(`Attachment ${attachmentID} is a weblink - keeping it`);
                    stats.weblinks++;
                    stats.valid++;
                    continue;
                }

                // Check if it's a file attachment (imported or linked file)
                if (linkMode === Zotero.Attachments.LINK_MODE_IMPORTED_FILE ||
                    linkMode === Zotero.Attachments.LINK_MODE_LINKED_FILE) {

                    this.log(`Attachment ${attachmentID} is a file attachment`);

                    // Check if file exists
                    try {
                        let filePath = attachment.getFilePath();
                        if (!filePath) {
                            this.log(`Attachment ${attachmentID} has no file path - removing`);
                            await attachment.eraseTx();
                            stats.removed++;
                            continue;
                        }

                        this.log(`Checking if file exists: ${filePath}`);
                        let file = attachment.getFile();

                        if (file && file.exists()) {
                            this.log(`File exists for attachment ${attachmentID} - keeping it`);
                            stats.valid++;
                        } else {
                            this.log(`File does not exist for attachment ${attachmentID} - removing it`);
                            await attachment.eraseTx();
                            stats.removed++;
                        }

                    } catch (fileError) {
                        this.log(`Error checking file for attachment ${attachmentID}: ${fileError} - removing it`);
                        try {
                            await attachment.eraseTx();
                            stats.removed++;
                        } catch (eraseError) {
                            this.log(`Error removing attachment ${attachmentID}: ${eraseError}`);
                        }
                    }
                } else {
                    this.log(`Attachment ${attachmentID} is unknown type (linkMode: ${linkMode}) - keeping it`);
                    stats.valid++;
                }
            }

            return stats;

        } catch (error) {
            this.log("Error in simpleAttachmentCheckBatch: " + error);
            return { valid: 0, removed: 0, weblinks: 0, processed: 1, errors: 1 };
        }
    },

    // Show batch summary
    showBatchSummary(totalStats, totalItems) {
        let message = `🔍 Batch Attachment Check Results\n\n`;
        message += `📊 Items processed: ${totalStats.processed} of ${totalItems}\n`;
        message += `✅ Valid attachments: ${totalStats.valid}\n`;
        
        if (totalStats.weblinks > 0) {
            message += `🔗 Weblinks kept: ${totalStats.weblinks}\n`;
        }
        
        if (totalStats.removed > 0) {
            message += `🗑️ Broken files removed: ${totalStats.removed}\n`;
        }

        if (totalStats.errors > 0) {
            message += `⚠️ Items with errors: ${totalStats.errors}\n`;
        }

        // Add percentage summary
        let successRate = Math.round(((totalStats.processed - totalStats.errors) / totalStats.processed) * 100);
        message += `\n📈 Success rate: ${successRate}%\n`;

        if (totalStats.removed > 0) {
            message += `\n🧹 Cleanup completed successfully`;
        } else {
            message += `\n✨ All attachments are valid`;
        }

        this.log("Batch summary: " + message.replace(/\n/g, ' | '));
        this.showDialog(message);
    },

    // ==========================================
    // MODULAR BATCH PROCESSING UTILITIES
    // ==========================================

    /**
     * Create and show a progress window for batch operations
     * @param {string} title - The main title for the progress window
     * @param {number} itemCount - Total number of items to process
     * @param {number} threshold - Minimum items to show progress (default: 10)
     * @returns {Object|null} Progress window object or null if not created
     */
    createProgressWindow(title, itemCount, threshold = 10) {
        if (itemCount <= threshold) {
            return null;
        }

        try {
            let window = Zotero.getMainWindow();
            if (window) {
                let progressWindow = new window.Zotero.ProgressWindow({ 
                    closeOnClick: false,
                    minWidth: 400,
                    minHeight: 150
                });
                progressWindow.changeHeadline(title);
                let progress = new progressWindow.ItemProgress();
                progress.setProgress(0);
                progress.setText(`Processing ${itemCount} items...`);
                progressWindow.show();
                return progressWindow;
            }
        } catch (error) {
            this.log(`Error creating progress window: ${error}`);
        }
        return null;
    },

    /**
     * Update progress window with current status
     * @param {Object} progressWindow - The progress window object
     * @param {number} currentIndex - Current item index being processed
     * @param {number} totalItems - Total number of items
     * @param {number} batchSize - Size of each batch
     * @param {string} baseTitle - Base title for the progress window
     */
    updateProgressWindow(progressWindow, currentIndex, totalItems, batchSize, baseTitle) {
        if (!progressWindow) return;

        try {
            let percent = Math.round((currentIndex / totalItems) * 100);
            let batchNumber = Math.floor(currentIndex / batchSize) + 1;
            let totalBatches = Math.ceil(totalItems / batchSize);
            let itemRange = `${currentIndex + 1}-${Math.min(currentIndex + batchSize, totalItems)}`;
            let statusText = `Processing batch ${batchNumber}/${totalBatches} (${itemRange} of ${totalItems})`;
            
            progressWindow.changeHeadline(`${baseTitle} (${percent}%)`);
            
            if (progressWindow._progressIndicators && progressWindow._progressIndicators.length > 0) {
                let progress = progressWindow._progressIndicators[0];
                if (progress && progress.setProgress && progress.setText) {
                    progress.setProgress(percent);
                    progress.setText(statusText);
                }
            }
        } catch (progressError) {
            this.log(`Error updating progress: ${progressError}`);
        }
    },

    /**
     * Close progress window safely
     * @param {Object} progressWindow - The progress window to close
     */
    closeProgressWindow(progressWindow) {
        if (progressWindow) {
            try {
                progressWindow.close();
            } catch (e) {
                // Ignore close errors
            }
        }
    },

    /**
     * Generic batch processor for any operation
     * @param {Array} items - Items to process
     * @param {Function} processFn - Function to process each item (should return Promise)
     * @param {Object} options - Processing options
     * @returns {Object} Processing results
     */
    async processBatch(items, processFn, options = {}) {
        const {
            batchSize = 5,
            delayBetweenBatches = 100,
            progressTitle = "Processing Items",
            progressThreshold = 10,
            onProgress = null,
            onBatchComplete = null
        } = options;

        // Create progress window
        let progressWindow = this.createProgressWindow(progressTitle, items.length, progressThreshold);
        
        let results = [];
        let errors = [];

        try {
            for (let i = 0; i < items.length; i += batchSize) {
                let batch = items.slice(i, i + batchSize);
                
                // Update progress
                this.updateProgressWindow(progressWindow, i, items.length, batchSize, progressTitle);
                
                // Call progress callback if provided
                if (onProgress) {
                    onProgress(i, items.length, batch);
                }

                // Process batch concurrently
                let batchPromises = batch.map(async (item, batchIndex) => {
                    try {
                        let result = await processFn(item, i + batchIndex);
                        return { success: true, item, result, index: i + batchIndex };
                    } catch (error) {
                        this.log(`Error processing item at index ${i + batchIndex}: ${error}`);
                        return { success: false, item, error, index: i + batchIndex };
                    }
                });

                let batchResults = await Promise.allSettled(batchPromises);
                
                // Collect results and errors
                for (let promiseResult of batchResults) {
                    if (promiseResult.status === 'fulfilled') {
                        let itemResult = promiseResult.value;
                        if (itemResult.success) {
                            results.push(itemResult);
                        } else {
                            errors.push(itemResult);
                        }
                    } else {
                        errors.push({
                            success: false,
                            error: promiseResult.reason,
                            index: i + results.length + errors.length
                        });
                    }
                }

                // Call batch complete callback if provided
                if (onBatchComplete) {
                    onBatchComplete(batch, batchResults, i + batchSize >= items.length);
                }

                // Delay between batches
                if (i + batchSize < items.length && delayBetweenBatches > 0) {
                    await new Promise(resolve => setTimeout(resolve, delayBetweenBatches));
                }
            }

            return {
                success: true,
                results,
                errors,
                totalProcessed: results.length + errors.length,
                successCount: results.length,
                errorCount: errors.length,
                successRate: results.length > 0 ? Math.round((results.length / (results.length + errors.length)) * 100) : 0
            };

        } catch (error) {
            this.log(`Error in batch processing: ${error}`);
            return {
                success: false,
                error,
                results,
                errors,
                totalProcessed: results.length + errors.length,
                successCount: results.length,
                errorCount: errors.length + 1
            };
        } finally {
            this.closeProgressWindow(progressWindow);
        }
    },

    /**
     * Generic summary dialog creator
     * @param {Object} stats - Processing statistics
     * @param {string} title - Dialog title
     * @param {Array} customLines - Additional custom lines to display
     */
    showGenericBatchSummary(stats, title, customLines = []) {
        let message = `${title}\n\n`;
        message += `📊 Items processed: ${stats.totalProcessed}\n`;
        message += `✅ Successfully processed: ${stats.successCount}\n`;
        
        // Add custom lines
        for (let line of customLines) {
            message += `${line}\n`;
        }
        
        if (stats.errorCount > 0) {
            message += `⚠️ Items with errors: ${stats.errorCount}\n`;
        }
        
        message += `\n📈 Success rate: ${stats.successRate}%`;
        
        this.log(`${title}: ${message.replace(/\n/g, ' | ')}`);
        this.showDialog(message);
    },

    // Fetch Metadata functionality
    async fetchMetadataForSelectedItems() {
        this.log("fetchMetadataForSelectedItems called");
        let selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
        this.log("Selected items count: " + selectedItems.length);

        if (!selectedItems.length) {
            this.log("No items selected");
            this.showDialog('Please select items to fetch metadata.');
            return;
        }

        // Filter items that can have DOI or ISBN
        let supportedItems = selectedItems.filter(item => {
            let itemType = Zotero.ItemTypes.getName(item.itemTypeID);
            return itemType === "journalArticle" || 
                   itemType === "conferencePaper" || 
                   itemType === "preprint" || 
                   itemType === "book";
        });

        if (!supportedItems.length) {
            this.showDialog('No supported item types selected.\nSupported types: Journal Articles, Conference Papers, Preprints, Books');
            return;
        }

        this.log(`Processing ${supportedItems.length} supported items`);

        // Use the modular batch processor with API-friendly settings
        let batchResult = await this.processBatch(
            supportedItems,
            (item) => this.fetchItemMetadata(item),
            {
                batchSize: 3,
                delayBetweenBatches: 500,
                progressTitle: "Fetching Metadata",
                progressThreshold: 10
            }
        );

        if (!batchResult.success) {
            this.showDialog("Error during metadata batch processing: " + batchResult.error);
            return;
        }

        // Show metadata-specific summary
        let customLines = [
            `🏷️ Check the item tags for detailed results.`
        ];
        
        this.showGenericBatchSummary(
            batchResult,
            "📖 Metadata Fetching Results",
            customLines
        );
    },

    // Main metadata fetching method
    async fetchItemMetadata(item) {
        try {
            let itemType = Zotero.ItemTypes.getName(item.itemTypeID);
            this.log(`Fetching metadata for item type: ${itemType}`);

            let result = { success: false, updated: false, error: null };

            if (itemType === "journalArticle" || itemType === "conferencePaper" || itemType === "preprint") {
                result = await this.fetchDOIBasedMetadata(item);
            } else if (itemType === "book") {
                result = await this.fetchISBNBasedMetadata(item);
            }

            return result;
        } catch (error) {
            this.log(`Error fetching metadata for item ${item.id}: ${error}`);
            // Add error tag
            item.addTag("Metadata Error", 1);
            await item.saveTx();
            return { success: false, updated: false, error: error.message };
        }
    },

    // DOI-based metadata fetching for articles
    async fetchDOIBasedMetadata(item) {
        this.log("Starting DOI-based metadata fetch");
        
        let result = { success: false, updated: false, error: null };
        
        // Try to get existing DOI
        let doi = this.extractDOI(item);
        this.log(`Existing DOI: ${doi || 'none'}`);
        
        // If no DOI found, try to discover one
        if (!doi) {
            this.log("No existing DOI, attempting discovery");
            doi = await this.discoverDOI(item);
            if (doi) {
                this.log(`Discovered DOI: ${doi}`);
                item.setField("DOI", doi);
                await item.saveTx();
                item.addTag("DOI Added", 1);
                result.updated = true;
            }
        }

        // Fetch and update metadata using DOI
        if (doi) {
            this.log(`Fetching article metadata for DOI: ${doi}`);
            
            // Method 1: Try Zotero's built-in translator system first (most reliable)
            let success = await this.fetchDOIMetadataViaTranslator(doi, item);
            if (success) {
                this.log("Successfully retrieved metadata via Zotero translator");
                item.addTag("Metadata Updated", 1);
                item.addTag("Via Zotero Translator", 1);
                await item.saveTx();
                result.success = true;
                result.updated = true;
            } else {
                this.log("Zotero translator failed, trying CrossRef API directly");
                
                // Method 2: Fall back to manual CrossRef API
                let metadata = await this.fetchCrossRefMetadata(doi);
                if (metadata) {
                    await this.updateItemWithMetadata(item, metadata);
                    item.addTag("Metadata Updated", 1);
                    item.addTag("Via CrossRef API", 1);
                    await item.saveTx();
                    result.success = true;
                    result.updated = true;
                } else {
                    item.addTag("CrossRef Failed", 1);
                    await item.saveTx();
                    result.error = "CrossRef API failed";
                }
            }
        } else {
            this.log("No DOI found or discovered");
            item.addTag("No DOI Found", 1);
            await item.saveTx();
            result.error = "No DOI found";
        }
        
        return result;
    },

    // ISBN-based metadata fetching for books
    async fetchISBNBasedMetadata(item) {
        this.log("Starting ISBN-based metadata fetch");
        
        let result = { success: false, updated: false, error: null };
        
        // Try to get existing ISBN
        let isbn = this.extractISBN(item);
        this.log(`Existing ISBN: ${isbn || 'none'}`);
        
        // If no ISBN found, try to discover one
        if (!isbn) {
            this.log("No existing ISBN, attempting discovery");
            isbn = await this.discoverISBN(item);
            if (isbn) {
                this.log(`Discovered ISBN: ${isbn}`);
                item.setField("ISBN", isbn);
                await item.saveTx();
                item.addTag("ISBN Added", 1);
                result.updated = true;
            }
        }

        // Fetch and update metadata using ISBN
        if (isbn) {
            this.log(`Fetching book metadata for ISBN: ${isbn}`);
            let metadata = await this.fetchBookMetadata(isbn, item);
            if (metadata) {
                // Check if it's the new Zotero translator format
                if (metadata.source === "Zotero Translator" && metadata.success) {
                    // Metadata was already applied directly to the item
                    item.addTag("Metadata Updated", 1);
                    item.addTag("Via Zotero Translator", 1);
                    await item.saveTx();
                    result.success = true;
                    result.updated = true;
                } else {
                    // Traditional API metadata that needs to be applied
                    await this.updateItemWithBookMetadata(item, metadata);
                    item.addTag("Metadata Updated", 1);
                    await item.saveTx();
                    result.success = true;
                    result.updated = true;
                }
            } else {
                item.addTag("Book API Failed", 1);
                await item.saveTx();
                result.error = "Book API failed";
            }
        } else {
            this.log("No ISBN found or discovered");
            item.addTag("No ISBN Found", 1);
            await item.saveTx();
            result.error = "No ISBN found";
        }
        
        return result;
    },

    // DOI extraction utility
    extractDOI(item) {
        // Try DOI field first
        let doi = item.getField("DOI");
        if (doi) {
            return Zotero.Utilities.cleanDOI(doi);
        }

        // Try extracting from URL
        let url = item.getField("url");
        if (url) {
            let doiMatch = url.match(/10\.\d{4,}\/[^\s]+/);
            if (doiMatch) return doiMatch[0];
        }

        // Try extracting from extra field
        let extra = item.getField("extra");
        if (extra) {
            let doiMatch = extra.match(/DOI[:\-\s]*([10]\.\d{4,}\/[^\s]+)/i);
            if (doiMatch) return doiMatch[1];
        }

        return null;
    },

    // ISBN extraction utility
    extractISBN(item) {
        // Try ISBN field first
        let isbn = item.getField("ISBN");
        if (isbn) {
            return Zotero.Utilities.cleanISBN(isbn);
        }

        // Try extracting from extra field
        let extra = item.getField("extra");
        if (extra) {
            let isbnMatch = extra.match(/ISBN[:\-\s]*([0-9\-xX]{10,17})/i);
            if (isbnMatch) return Zotero.Utilities.cleanISBN(isbnMatch[1]);
        }

        return null;
    },

    // DOI discovery method
    async discoverDOI(item) {
        // Strategy 1: CrossRef search (best for academic papers)
        let doi = await this.searchCrossRefForDOI(item);
        if (doi) return doi;

        // Strategy 2: OpenAlex (free, generous limits, good coverage)
        doi = await this.searchOpenAlexForDOI(item);
        if (doi) return doi;

        // Strategy 3: Semantic Scholar (good but has rate limits)
        doi = await this.searchSemanticScholarForDOI(item);
        if (doi) return doi;

        // Strategy 4: DBLP (good for computer science)
        doi = await this.searchDBLPForDOI(item);
        if (doi) return doi;

        // Strategy 5: Google Scholar (scraping, use sparingly)
        doi = await this.searchGoogleScholarForDOI(item);
        if (doi) return doi;

        return null;
    },

    // ISBN discovery method
    async discoverISBN(item) {
        // Strategy 1: OpenLibrary search
        let isbn = await this.searchOpenLibraryForISBN(item);
        if (isbn) return isbn;

        // Strategy 2: Google Books search
        isbn = await this.searchGoogleBooksForISBN(item);
        if (isbn) return isbn;

        return null;
    },

    // CrossRef DOI search implementation
    async searchCrossRefForDOI(item) {
        try {
            let title = item.getField("title");
            if (!title) return null;

            // Build comprehensive search query
            let query = `title:"${title}"`;

            // Add author information
            let creators = item.getCreators();
            if (creators.length > 0) {
                let firstAuthor = creators[0];
                if (firstAuthor.lastName) {
                    query += ` author:"${firstAuthor.lastName}"`;
                }
            }

            // Add publication year
            let date = item.getField("date");
            if (date) {
                let year = Zotero.Date.strToDate(date).year;
                if (year) {
                    query += ` published:${year}`;
                }
            }

            let encodedQuery = encodeURIComponent(query);
            let url = `https://api.crossref.org/works?query=${encodedQuery}&rows=5`;

            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.message && data.message.items.length > 0) {
                    // Find best match by title similarity
                    for (let work of data.message.items) {
                        if (work.DOI && work.title && this.titleSimilarity(work.title[0], title) > 0.8) {
                            return Zotero.Utilities.cleanDOI(work.DOI);
                        }
                    }
                }
            }
        } catch (error) {
            this.log("CrossRef DOI search error: " + error);
        }
        return null;
    },

    // OpenAlex DOI search implementation (generous rate limits, good coverage)
    async searchOpenAlexForDOI(item) {
        try {
            let title = item.getField("title");
            if (!title) return null;

            // Strategy 1: Try exact title + author search
            let doi = await this.searchOpenAlexExact(item, title);
            if (doi) return doi;

            // Strategy 2: Try title-only search
            doi = await this.searchOpenAlexTitleOnly(item, title);
            if (doi) return doi;

        } catch (error) {
            this.log("OpenAlex DOI search error: " + error);
        }
        return null;
    },

    // OpenAlex exact search with title and author
    async searchOpenAlexExact(item, title) {
        try {
            // Build search query - OpenAlex uses different syntax
            let filters = [`title.search:"${title}"`];

            // Add author filter
            let creators = item.getCreators();
            if (creators.length > 0) {
                let firstAuthor = creators[0];
                if (firstAuthor.lastName) {
                    let authorName = firstAuthor.firstName ? 
                        `${firstAuthor.firstName} ${firstAuthor.lastName}` : 
                        firstAuthor.lastName;
                    filters.push(`authorships.author.display_name.search:"${authorName}"`);
                }
            }

            let filterString = filters.join(',');
            let url = `https://api.openalex.org/works?filter=${encodeURIComponent(filterString)}&per-page=5`;

            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.results && data.results.length > 0) {
                    for (let work of data.results) {
                        if (work.doi && work.title) {
                            let similarity = this.titleSimilarity(work.title, title);
                            if (similarity > 0.95) {
                                this.log(`OpenAlex exact match found: ${work.title} (similarity: ${similarity.toFixed(2)})`);
                                return Zotero.Utilities.cleanDOI(work.doi.replace('https://doi.org/', ''));
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.log("OpenAlex exact search error: " + error);
        }
        return null;
    },

    // OpenAlex title-only search
    async searchOpenAlexTitleOnly(item, title) {
        try {
            // Clean title for better matching
            let cleanTitle = title
                .replace(/[^\w\s]/g, ' ')
                .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();

            let url = `https://api.openalex.org/works?filter=title.search:"${encodeURIComponent(cleanTitle)}"&per-page=10`;

            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.results && data.results.length > 0) {
                    for (let work of data.results) {
                        if (work.doi && work.title) {
                            let similarity = this.titleSimilarity(work.title, title);
                            if (similarity > 0.9) {
                                this.log(`OpenAlex title match found: ${work.title} (similarity: ${similarity.toFixed(2)})`);
                                return Zotero.Utilities.cleanDOI(work.doi.replace('https://doi.org/', ''));
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.log("OpenAlex title search error: " + error);
        }
        return null;
    },

    // DBLP search for computer science papers
    async searchDBLPForDOI(item) {
        try {
            let title = item.getField("title");
            if (!title) return null;

            // DBLP has a simple search API
            let cleanTitle = encodeURIComponent(title.replace(/[^\w\s]/g, ' ').trim());
            let url = `https://dblp.org/search/publ/api?q=${cleanTitle}&format=json&h=10`;

            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.result && data.result.hits && data.result.hits.hit) {
                    let hits = Array.isArray(data.result.hits.hit) ? data.result.hits.hit : [data.result.hits.hit];
                    
                    for (let hit of hits) {
                        if (hit.info && hit.info.title && hit.info.doi) {
                            let similarity = this.titleSimilarity(hit.info.title, title);
                            if (similarity > 0.9) {
                                this.log(`DBLP match found: ${hit.info.title} (similarity: ${similarity.toFixed(2)})`);
                                return Zotero.Utilities.cleanDOI(hit.info.doi);
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.log("DBLP search error: " + error);
        }
        return null;
    },

    // Google Scholar search (scraping - use sparingly due to rate limits)
    async searchGoogleScholarForDOI(item) {
        try {
            let title = item.getField("title");
            if (!title) return null;

            // Build Google Scholar search query
            let query = `"${title}"`;
            
            // Add author if available
            let creators = item.getCreators();
            if (creators.length > 0) {
                let firstAuthor = creators[0];
                if (firstAuthor.lastName) {
                    query += ` author:"${firstAuthor.lastName}"`;
                }
            }

            let encodedQuery = encodeURIComponent(query);
            let url = `https://scholar.google.com/scholar?q=${encodedQuery}&hl=en&num=5`;

            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                },
            });

            if (response.status === 200) {
                // Parse HTML to look for DOI links
                let parser = new DOMParser();
                let doc = parser.parseFromString(response.responseText, "text/html");
                
                // Look for DOI patterns in the page
                let pageText = doc.body.textContent || "";
                let doiMatches = pageText.match(/10\.\d{4,}\/[^\s\],"';]+/g);
                
                if (doiMatches && doiMatches.length > 0) {
                    // Return the first DOI found
                    let doi = doiMatches[0].replace(/[.,;'")\]]+$/, ''); // Clean trailing punctuation
                    this.log(`Google Scholar DOI found: ${doi}`);
                    return Zotero.Utilities.cleanDOI(doi);
                }

                // Also look for direct DOI links
                let doiLinks = doc.querySelectorAll('a[href*="doi.org"]');
                if (doiLinks.length > 0) {
                    let href = doiLinks[0].href;
                    let doiMatch = href.match(/doi\.org\/(.+)$/);
                    if (doiMatch) {
                        this.log(`Google Scholar DOI link found: ${doiMatch[1]}`);
                        return Zotero.Utilities.cleanDOI(doiMatch[1]);
                    }
                }
            }
        } catch (error) {
            this.log("Google Scholar search error (this is expected due to anti-bot measures): " + error);
        }
        return null;
    },

    // Semantic Scholar DOI search implementation
    async searchSemanticScholarForDOI(item) {
        try {
            let title = item.getField("title");
            if (!title) return null;

            // Strategy 1: Try exact title + author search
            let doi = await this.searchSemanticScholarExact(item, title);
            if (doi) return doi;

            // Strategy 2: Try relaxed title search
            doi = await this.searchSemanticScholarRelaxed(item, title);
            if (doi) return doi;

        } catch (error) {
            this.log("Semantic Scholar DOI search error: " + error);
        }
        return null;
    },

    // Exact search with title and author
    async searchSemanticScholarExact(item, title) {
        try {
            // Build refined query with title and author
            let query = `title:"${title}"`;

            // Add first author
            let creators = item.getCreators();
            if (creators.length > 0) {
                let firstAuthor = creators[0];
                if (firstAuthor.lastName) {
                    query += ` author:"${firstAuthor.lastName}"`;
                    // Add first name if available
                    if (firstAuthor.firstName) {
                        query += ` author:"${firstAuthor.firstName}"`;
                    }
                }
            }

            let encodedQuery = encodeURIComponent(query);
            let url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodedQuery}&limit=3&fields=title,externalIds,authors`;

            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.data && data.data.length > 0) {
                    for (let paper of data.data) {
                        if (paper.externalIds && paper.externalIds.DOI && paper.title) {
                            // Use very high threshold for exact search
                            if (this.titleSimilarity(paper.title, title) > 0.95) {
                                this.log(`Semantic Scholar exact match found: ${paper.title} in ${paper.venue} (similarity: ${this.titleSimilarity(paper.title, title).toFixed(2)})`);
                                
                                // Return DOI if available, otherwise return a special identifier for conference papers
                                if (paper.externalIds && paper.externalIds.DOI) {
                                    return Zotero.Utilities.cleanDOI(paper.externalIds.DOI);
                                } else {
                                    // For conference papers without DOI, return a special format
                                    this.log(`Conference paper found without DOI, using venue: ${paper.venue}`);
                                    return `VENUE:${paper.venue}|TITLE:${paper.title}`;
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.log("Semantic Scholar exact search error: " + error);
        }
        return null;
    },

    // Relaxed search with just title
    async searchSemanticScholarRelaxed(item, title) {
        try {
            // Clean title for better matching - remove special characters and extra words
            let cleanTitle = title
                .replace(/[^\w\s]/g, ' ')
                .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();

            let encodedTitle = encodeURIComponent(cleanTitle);
            let url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodedTitle}&limit=10&fields=title,externalIds,venue`;

            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.data && data.data.length > 0) {
                    for (let paper of data.data) {
                        if (paper.externalIds && paper.externalIds.DOI && paper.title) {
                            let similarity = this.titleSimilarity(paper.title, title);
                            if (similarity > 0.9) {
                                this.log(`Semantic Scholar relaxed match found: ${paper.title} in ${paper.venue} (similarity: ${similarity.toFixed(2)})`);
                                
                                // Return DOI if available, otherwise return a special identifier for conference papers
                                if (paper.externalIds && paper.externalIds.DOI) {
                                    return Zotero.Utilities.cleanDOI(paper.externalIds.DOI);
                                } else {
                                    // For conference papers without DOI, return a special format
                                    this.log(`Conference paper found without DOI, using venue: ${paper.venue}`);
                                    return `VENUE:${paper.venue}|TITLE:${paper.title}`;
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.log("Semantic Scholar relaxed search error: " + error);
        }
        return null;
    },

    // OpenLibrary ISBN search implementation
    async searchOpenLibraryForISBN(item) {
        try {
            let title = item.getField("title");
            if (!title) return null;

            let authors = item.getCreators()
                .filter(creator => creator.creatorType === "author")
                .map(creator => creator.lastName || creator.name)
                .join(" ");

            let query = `title:"${title}"`;
            if (authors) query += ` author:"${authors}"`;

            let encodedQuery = encodeURIComponent(query);
            let url = `https://openlibrary.org/search.json?q=${encodedQuery}&limit=5`;

            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.docs && data.docs.length > 0) {
                    for (let book of data.docs) {
                        if (book.isbn && book.title && 
                            this.titleSimilarity(book.title, title) > 0.8) {
                            return book.isbn[0]; // Return first ISBN
                        }
                    }
                }
            }
        } catch (error) {
            this.log("OpenLibrary ISBN search error: " + error);
        }
        return null;
    },

    // Google Books ISBN search implementation
    async searchGoogleBooksForISBN(item) {
        try {
            let title = item.getField("title");
            if (!title) return null;

            let authors = item.getCreators()
                .filter(creator => creator.creatorType === "author")
                .map(creator => creator.lastName || creator.name)
                .join(" ");

            let query = `intitle:"${title}"`;
            if (authors) query += ` inauthor:"${authors}"`;

            let encodedQuery = encodeURIComponent(query);
            let url = `https://www.googleapis.com/books/v1/volumes?q=${encodedQuery}&maxResults=5`;

            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.items && data.items.length > 0) {
                    for (let book of data.items) {
                        if (book.volumeInfo && book.volumeInfo.industryIdentifiers && 
                            book.volumeInfo.title &&
                            this.titleSimilarity(book.volumeInfo.title, title) > 0.8) {
                            let isbn = book.volumeInfo.industryIdentifiers.find(
                                id => id.type === "ISBN_13" || id.type === "ISBN_10"
                            );
                            if (isbn) return isbn.identifier;
                        }
                    }
                }
            }
        } catch (error) {
            this.log("Google Books ISBN search error: " + error);
        }
        return null;
    },

    // CrossRef metadata fetching
    async fetchCrossRefMetadata(doi) {
        try {
            let url = `https://api.crossref.org/works/${doi}`;
            
            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                return data.message;
            }
        } catch (error) {
            this.log("CrossRef metadata fetch error: " + error);
        }
        return null;
    },

    // Book metadata fetching
    async fetchBookMetadata(isbn, item) {
        this.log(`Starting book metadata fetch for ISBN: ${isbn}`);
        
        // Method 1: Try Zotero's built-in translator system first (most reliable)
        let success = await this.fetchBookMetadataViaTranslator(isbn, item);
        if (success) {
            this.log("Successfully retrieved metadata via Zotero translator");
            return { source: "Zotero Translator", success: true };
        } else {
            this.log("Zotero translator failed, trying manual API calls");
        }
        
        // Method 2: Try OpenLibrary API
        let metadata = await this.fetchOpenLibraryMetadata(isbn);
        if (metadata) {
            this.log("Successfully retrieved metadata from OpenLibrary");
            return metadata;
        } else {
            this.log("OpenLibrary failed, trying Google Books");
        }
        
        // Method 3: Try Google Books API
        metadata = await this.fetchGoogleBooksMetadata(isbn);
        if (metadata) {
            this.log("Successfully retrieved metadata from Google Books");
            return metadata;
        } else {
            this.log("Google Books also failed, trying alternative strategies");
        }
        
        // Method 4: Try alternative ISBN formats with all methods
        metadata = await this.tryAlternativeISBNFormats(isbn, item);
        if (metadata) {
            this.log("Successfully retrieved metadata using alternative ISBN format");
            return metadata;
        }
        
        this.log("All book metadata sources failed");
        return null;
    },

    // Use Zotero's built-in translator system for book metadata (most reliable)
    async fetchBookMetadataViaTranslator(isbn, item) {
        try {
            this.log(`Attempting book metadata fetch via Zotero translator for ISBN: ${isbn}`);
            
            // Create identifier object for translation
            let identifier = {
                itemType: "book",
                ISBN: isbn
            };
            
            // Set up translator
            let translate = new Zotero.Translate.Search();
            translate.setIdentifier(identifier);
            
            // Get available translators
            let translators = await translate.getTranslators();
            if (!translators || translators.length === 0) {
                this.log("No translators available for book metadata");
                return false;
            }
            
            this.log(`Found ${translators.length} translators for book metadata`);
            translate.setTranslator(translators);
            
            // Perform translation
            let newItems = await translate.translate();
            if (!newItems || newItems.length === 0) {
                this.log("Translation returned no items");
                return false;
            }
            
            let newItem = newItems[0];
            this.log(`Translation successful, updating item with new metadata`);
            
            // Helper function to update fields
            const updateField = (field) => {
                if (newItem.getField(field)) {
                    let currentValue = item.getField(field);
                    let newValue = newItem.getField(field);
                    if (!currentValue || currentValue.length < 10 || currentValue !== newValue) {
                        item.setField(field, newValue);
                        this.log(`Updated ${field}: "${newValue}"`);
                    }
                }
            };
            
            // Update creators (authors)
            let currentCreators = item.getCreators();
            let newCreators = newItem.getCreators();
            if (currentCreators.length === 0 && newCreators.length > 0) {
                item.setCreators(newCreators);
                this.log(`Updated creators: ${newCreators.length} authors`);
            }
            
            // Update book fields
            let fields = ["title", "publisher", "place", "edition", "date", "numPages", "url", "abstractNote"];
            for (let field of fields) {
                updateField(field);
            }
            
            // Clean up the temporary item
            newItem.deleted = true;
            await newItem.saveTx();
            
            // Save the updated item
            await item.saveTx();
            
            this.log("Successfully updated item via Zotero translator");
            return true;
            
        } catch (error) {
            this.log(`Zotero translator error: ${error}`);
            return false;
        }
    },

    // Use Zotero's built-in translator system for DOI metadata (most reliable)
    async fetchDOIMetadataViaTranslator(doi, item) {
        try {
            this.log(`Attempting DOI metadata fetch via Zotero translator for DOI: ${doi}`);
            
            // Create identifier object for translation
            let identifier = {
                itemType: Zotero.ItemTypes.getName(item.itemTypeID),
                DOI: doi
            };
            
            // Set up translator
            let translate = new Zotero.Translate.Search();
            translate.setIdentifier(identifier);
            
            // Get available translators
            let translators = await translate.getTranslators();
            if (!translators || translators.length === 0) {
                this.log("No translators available for DOI metadata");
                return false;
            }
            
            this.log(`Found ${translators.length} translators for DOI metadata`);
            translate.setTranslator(translators);
            
            // Perform translation
            let newItems = await translate.translate();
            if (!newItems || newItems.length === 0) {
                this.log("DOI translation returned no items");
                return false;
            }
            
            let newItem = newItems[0];
            this.log(`DOI translation successful, updating item with new metadata`);
            
            // Helper function to update fields (only if current is empty or significantly shorter)
            const updateField = (field) => {
                if (newItem.getField(field)) {
                    let currentValue = item.getField(field);
                    let newValue = newItem.getField(field);
                    if (!currentValue || currentValue.length < 10 || currentValue !== newValue) {
                        item.setField(field, newValue);
                        this.log(`Updated ${field}: "${newValue}"`);
                    }
                }
            };
            
            // Update creators (authors) if current item has none or very few
            let currentCreators = item.getCreators();
            let newCreators = newItem.getCreators();
            if (currentCreators.length === 0 && newCreators.length > 0) {
                item.setCreators(newCreators);
                this.log(`Updated creators: ${newCreators.length} authors`);
            } else if (currentCreators.length < newCreators.length) {
                // Only update if new item has significantly more authors
                item.setCreators(newCreators);
                this.log(`Updated creators: ${newCreators.length} authors (had ${currentCreators.length})`);
            }
            
            // Update article fields
            let fields = ["title", "publicationTitle", "volume", "issue", "pages", "date", "url", "abstractNote"];
            for (let field of fields) {
                updateField(field);
            }
            
            // Ensure DOI field is set
            if (!item.getField("DOI")) {
                item.setField("DOI", doi);
                this.log(`Set DOI field: ${doi}`);
            }
            
            // Clean up the temporary item
            newItem.deleted = true;
            await newItem.saveTx();
            
            // Save the updated item
            await item.saveTx();
            
            this.log("Successfully updated item via Zotero DOI translator");
            return true;
            
        } catch (error) {
            this.log(`Zotero DOI translator error: ${error}`);
            return false;
        }
    },

    // Try alternative ISBN formats (ISBN-10 vs ISBN-13, with/without hyphens)
    async tryAlternativeISBNFormats(originalISBN, item) {
        try {
            let alternativeISBNs = [];
            
            // Clean the original ISBN
            let cleanISBN = originalISBN.replace(/[-\s]/g, '');
            
            // Try to convert between ISBN-10 and ISBN-13
            if (cleanISBN.length === 10) {
                // Convert ISBN-10 to ISBN-13
                let isbn13 = this.convertISBN10to13(cleanISBN);
                if (isbn13) alternativeISBNs.push(isbn13);
            } else if (cleanISBN.length === 13) {
                // Convert ISBN-13 to ISBN-10
                let isbn10 = this.convertISBN13to10(cleanISBN);
                if (isbn10) alternativeISBNs.push(isbn10);
            }
            
            // Try with and without hyphens
            alternativeISBNs.push(this.formatISBNWithHyphens(cleanISBN));
            alternativeISBNs.push(cleanISBN);
            
            // Try each alternative ISBN
            for (let altISBN of alternativeISBNs) {
                if (altISBN && altISBN !== originalISBN) {
                    this.log(`Trying alternative ISBN format: ${altISBN}`);
                    
                    // Try Zotero translator first with alternative ISBN
                    let success = await this.fetchBookMetadataViaTranslator(altISBN, item);
                    if (success) {
                        this.log(`Zotero translator succeeded with alternative ISBN: ${altISBN}`);
                        return { source: "Zotero Translator", success: true };
                    }
                    
                    // Fall back to manual APIs
                    let metadata = await this.fetchOpenLibraryMetadata(altISBN);
                    if (metadata) return metadata;
                    
                    metadata = await this.fetchGoogleBooksMetadata(altISBN);
                    if (metadata) return metadata;
                }
            }
            
        } catch (error) {
            this.log(`Error trying alternative ISBN formats: ${error}`);
        }
        
        return null;
    },

    // Convert ISBN-10 to ISBN-13
    convertISBN10to13(isbn10) {
        try {
            if (isbn10.length !== 10) return null;
            
            // Remove check digit and add 978 prefix
            let base = '978' + isbn10.substring(0, 9);
            
            // Calculate check digit for ISBN-13
            let sum = 0;
            for (let i = 0; i < 12; i++) {
                sum += parseInt(base[i]) * (i % 2 === 0 ? 1 : 3);
            }
            let checkDigit = (10 - (sum % 10)) % 10;
            
            return base + checkDigit;
        } catch (error) {
            this.log(`Error converting ISBN-10 to ISBN-13: ${error}`);
            return null;
        }
    },

    // Convert ISBN-13 to ISBN-10
    convertISBN13to10(isbn13) {
        try {
            if (isbn13.length !== 13 || !isbn13.startsWith('978')) return null;
            
            // Remove 978 prefix and check digit
            let base = isbn13.substring(3, 12);
            
            // Calculate check digit for ISBN-10
            let sum = 0;
            for (let i = 0; i < 9; i++) {
                sum += parseInt(base[i]) * (10 - i);
            }
            let checkDigit = (11 - (sum % 11)) % 11;
            let checkChar = checkDigit === 10 ? 'X' : checkDigit.toString();
            
            return base + checkChar;
        } catch (error) {
            this.log(`Error converting ISBN-13 to ISBN-10: ${error}`);
            return null;
        }
    },

    // Format ISBN with standard hyphens
    formatISBNWithHyphens(isbn) {
        try {
            if (isbn.length === 10) {
                // Simple ISBN-10 formatting
                return `${isbn.substring(0, 1)}-${isbn.substring(1, 6)}-${isbn.substring(6, 9)}-${isbn.substring(9)}`;
            } else if (isbn.length === 13) {
                // Simple ISBN-13 formatting
                return `${isbn.substring(0, 3)}-${isbn.substring(3, 4)}-${isbn.substring(4, 9)}-${isbn.substring(9, 12)}-${isbn.substring(12)}`;
            }
        } catch (error) {
            // Return original if formatting fails
        }
        return isbn;
    },

    // OpenLibrary metadata fetching
    async fetchOpenLibraryMetadata(isbn) {
        try {
            this.log(`Fetching OpenLibrary metadata for ISBN: ${isbn}`);
            let url = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=details`;
            this.log(`OpenLibrary URL: ${url}`);
            
            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
                timeout: 15000  // 15 second timeout
            });

            this.log(`OpenLibrary response status: ${response.status}`);
            
            if (response.status === 200) {
                this.log(`OpenLibrary response length: ${response.responseText.length} characters`);
                
                let data = JSON.parse(response.responseText);
                this.log(`OpenLibrary parsed data keys: ${Object.keys(data).join(', ')}`);
                
                let key = `ISBN:${isbn}`;
                if (data[key]) {
                    this.log(`Found data for key: ${key}`);
                    if (data[key].details) {
                        let details = data[key].details;
                        this.log(`OpenLibrary details found: title="${details.title || 'none'}", authors=${details.authors?.length || 0}`);
                        return details;
                    } else {
                        this.log("OpenLibrary response missing details field");
                    }
                } else {
                    this.log(`No data found for key: ${key}, available keys: ${Object.keys(data).join(', ')}`);
                }
            } else {
                this.log(`OpenLibrary returned HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            this.log("OpenLibrary metadata fetch error: " + error);
        }
        return null;
    },

    // Google Books metadata fetching
    async fetchGoogleBooksMetadata(isbn) {
        try {
            this.log(`Fetching Google Books metadata for ISBN: ${isbn}`);
            let url = `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`;
            this.log(`Google Books URL: ${url}`);
            
            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
                timeout: 15000  // 15 second timeout
            });

            this.log(`Google Books response status: ${response.status}`);

            if (response.status === 200) {
                this.log(`Google Books response length: ${response.responseText.length} characters`);
                
                let data = JSON.parse(response.responseText);
                this.log(`Google Books total items: ${data.totalItems || 0}`);
                
                if (data.items && data.items.length > 0) {
                    let volumeInfo = data.items[0].volumeInfo;
                    this.log(`Google Books volume info found: title="${volumeInfo.title || 'none'}", authors=${volumeInfo.authors?.length || 0}`);
                    return volumeInfo;
                } else {
                    this.log("Google Books returned no items for this ISBN");
                }
            } else {
                this.log(`Google Books returned HTTP ${response.status}: ${response.statusText}`);
            }
        } catch (error) {
            this.log("Google Books metadata fetch error: " + error);
        }
        return null;
    },

    // Update item with CrossRef metadata
    async updateItemWithMetadata(item, metadata) {
        try {
            // Update title if empty or significantly different
            if (metadata.title && metadata.title[0]) {
                let currentTitle = item.getField("title");
                if (!currentTitle || currentTitle.length < 10) {
                    item.setField("title", metadata.title[0]);
                }
            }

            // Update authors
            if (metadata.author) {
                let creators = item.getCreators();
                if (creators.length === 0) {
                    metadata.author.forEach(author => {
                        let creatorType = Zotero.CreatorTypes.getPrimaryIDForType(item.itemTypeID);
                        item.setCreator(item.numCreators(), {
                            firstName: author.given || "",
                            lastName: author.family || "",
                            creatorTypeID: creatorType
                        });
                    });
                }
            }

            // Update publication info
            if (metadata["container-title"] && metadata["container-title"][0]) {
                item.setField("publicationTitle", metadata["container-title"][0]);
            }

            if (metadata.published && metadata.published["date-parts"] && metadata.published["date-parts"][0]) {
                let year = metadata.published["date-parts"][0][0];
                if (year) {
                    item.setField("date", year.toString());
                }
            }

            // Update volume/issue/pages
            if (metadata.volume) {
                item.setField("volume", metadata.volume);
            }
            if (metadata.issue) {
                item.setField("issue", metadata.issue);
            }
            if (metadata.page) {
                item.setField("pages", metadata.page);
            }

            // Update URL if not present
            if (metadata.URL && !item.getField("url")) {
                item.setField("url", metadata.URL);
            }

            await item.saveTx();
        } catch (error) {
            this.log("Error updating item with CrossRef metadata: " + error);
        }
    },

    // Update item with book metadata
    async updateItemWithBookMetadata(item, metadata) {
        try {
            // Update title if empty or significantly different
            if (metadata.title) {
                let currentTitle = item.getField("title");
                if (!currentTitle || currentTitle.length < 10) {
                    item.setField("title", metadata.title);
                }
            }

            // Update authors (OpenLibrary format)
            if (metadata.authors) {
                let creators = item.getCreators();
                if (creators.length === 0) {
                    metadata.authors.forEach(author => {
                        let creatorType = Zotero.CreatorTypes.getPrimaryIDForType(item.itemTypeID);
                        let name = author.name || author;
                        let nameParts = name.split(' ');
                        item.setCreator(item.numCreators(), {
                            firstName: nameParts.slice(0, -1).join(' ') || "",
                            lastName: nameParts[nameParts.length - 1] || name,
                            creatorTypeID: creatorType
                        });
                    });
                }
            }

            // Update publisher
            if (metadata.publishers && metadata.publishers[0]) {
                item.setField("publisher", metadata.publishers[0]);
            }

            // Update publication date
            if (metadata.publish_date) {
                item.setField("date", metadata.publish_date);
            }

            // Update pages
            if (metadata.number_of_pages) {
                item.setField("numPages", metadata.number_of_pages.toString());
            }

            await item.saveTx();
        } catch (error) {
            this.log("Error updating item with book metadata: " + error);
        }
    },

    // Title similarity calculation (simple word-based comparison)
    titleSimilarity(title1, title2) {
        // Normalize titles for comparison
        let normalize = (str) =>
            str
                .toLowerCase()
                .replace(/[^\w\s]/g, "")
                .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/g, "")
                .replace(/\s+/g, " ")
                .trim();

        let norm1 = normalize(title1);
        let norm2 = normalize(title2);

        if (norm1 === norm2) return 1.0;

        // Simple Jaccard similarity
        let words1 = new Set(norm1.split(" "));
        let words2 = new Set(norm2.split(" "));
        let intersection = new Set([...words1].filter((x) => words2.has(x)));
        let union = new Set([...words1, ...words2]);

        return intersection.size / union.size;
    },

    // Process arXiv items functionality
    async processArxivItems() {
        this.log("processArxivItems called");
        let selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
        this.log("Selected items count: " + selectedItems.length);

        if (!selectedItems.length) {
            this.log("No items selected");
            this.showDialog('Please select items to process arXiv items.');
            return;
        }

        // Filter for items that could be arXiv papers
        let candidateItems = selectedItems.filter(item => {
            let itemType = Zotero.ItemTypes.getName(item.itemTypeID);
            
            // Include journal articles, preprints, and conference papers
            let isSupportedType = itemType === "journalArticle" || 
                                  itemType === "preprint" || 
                                  itemType === "conferencePaper";
            
            if (!isSupportedType) {
                return false;
            }
            
            // Check if it looks like an arXiv item first
            if (this.isArxivItem(item)) {
                return true;
            }
            
            // For non-arXiv items, only include if they don't have DOI or failed to get DOI
            let hasNoDOI = !this.extractDOI(item);
            let hasFailedTag = item.hasTag("No DOI Found") || item.hasTag("CrossRef Failed");
            
            return hasNoDOI || hasFailedTag;
        });

        if (!candidateItems.length) {
            this.showDialog('No suitable items found.\n\nLooking for:\n• arXiv items (any type)\n• Articles/Preprints without DOI\n• Items with failed DOI fetch');
            return;
        }

        this.log(`Processing ${candidateItems.length} candidate items`);

        // Use the modular batch processor with conservative settings for complex operations
        let batchResult = await this.processBatch(
            candidateItems,
            (item) => this.processArxivItem(item),
            {
                batchSize: 3,
                delayBetweenBatches: 1000,
                progressTitle: "Processing arXiv Items",
                progressThreshold: 10
            }
        );

        if (!batchResult.success) {
            this.showDialog("Error during arXiv batch processing: " + batchResult.error);
            return;
        }

        // Aggregate arXiv-specific statistics
        let convertedToPreprint = 0;
        let foundPublishedVersions = 0;

        for (let result of batchResult.results) {
            if (result.result) {
                if (result.result.converted) convertedToPreprint++;
                if (result.result.foundPublished) foundPublishedVersions++;
            }
        }

        // Show arXiv-specific summary
        let customLines = [
            `📚 Updated to published versions: ${foundPublishedVersions}`,
            `🔄 Converted to preprints: ${convertedToPreprint}`
        ];
        
        this.showGenericBatchSummary(
            batchResult,
            "📄 arXiv Processing Results",
            customLines
        );
    },

    // Process individual arXiv item
    async processArxivItem(item) {
        let result = { processed: false, converted: false, foundPublished: false };
        
        try {
            // Check if this is an arXiv item
            if (this.isArxivItem(item)) {
                this.log(`Item ${item.id} is from arXiv`);
                
                // First, try to find published version
                let publishedDOI = await this.findPublishedVersion(item);
                
                if (publishedDOI) {
                    this.log(`Found published version: ${publishedDOI}`);
                    
                    // Check if we're changing item types (which would warrant downloading)
                    let currentItemType = Zotero.ItemTypes.getName(item.itemTypeID);
                    let willChangeType = (currentItemType === "journalArticle" && publishedDOI.startsWith("VENUE:")) ||
                                        (currentItemType !== "journalArticle" && !publishedDOI.startsWith("VENUE:"));
                    
                    // Update current item with published info and metadata
                    await this.updateItemAsPublishedVersion(item, publishedDOI);
                    
                    // Only try to download if we're changing types or item has no PDF
                    let hasExistingPDF = await this.itemHasPDF(item);
                    if (willChangeType || !hasExistingPDF) {
                        this.log(`Attempting download: type change=${willChangeType}, has PDF=${hasExistingPDF}`);
                        await this.downloadPublishedVersion(item, publishedDOI);
                    } else {
                        this.log(`Skipping download: item already has PDF and no type change needed`);
                        item.addTag("PDF Already Present", 1);
                        await item.saveTx();
                    }
                    
                    result.foundPublished = true;
                    item.addTag("Updated to Published Version", 1);
                } else {
                    this.log(`No published version found for item ${item.id}, converting to preprint`);
                    
                    // Only convert to preprint if no published version found and it's currently a journal article
                    if (Zotero.ItemTypes.getName(item.itemTypeID) === "journalArticle") {
                        await this.convertToPreprint(item);
                        result.converted = true;
                        this.log(`Converted item ${item.id} to preprint`);
                    }
                }
                
                result.processed = true;
            } else {
                this.log(`Item ${item.id} is not from arXiv, skipping`);
            }
        } catch (error) {
            this.log(`Error processing arXiv item ${item.id}: ${error}`);
            item.addTag("arXiv Process Error", 1);
            await item.saveTx();
        }

        return result;
    },

    // Check if item is from arXiv
    isArxivItem(item) {
        // Check publication title
        let publication = item.getField("publicationTitle");
        if (publication && publication.toLowerCase().includes("arxiv")) {
            return true;
        }

        // Check URL for arXiv patterns
        let url = item.getField("url");
        if (url && (url.includes("arxiv.org") || url.includes("arXiv"))) {
            return true;
        }

        // Check extra field for arXiv ID
        let extra = item.getField("extra");
        if (extra && extra.match(/arXiv[:\s]*\d{4}\.\d{4,5}/i)) {
            return true;
        }

        // Check title for arXiv patterns
        let title = item.getField("title");
        if (title && title.toLowerCase().includes("arxiv")) {
            return true;
        }

        return false;
    },

    // Convert journal article to preprint
    async convertToPreprint(item) {
        try {
            // Change item type to preprint
            let preprintTypeID = Zotero.ItemTypes.getID("preprint");
            item.setType(preprintTypeID);

            // Update repository field if not present
            let repository = item.getField("repository");
            if (!repository) {
                item.setField("repository", "arXiv");
            }

            // Clear publication title since it's now a preprint
            item.setField("publicationTitle", "");

            // Add tag to indicate conversion
            item.addTag("Converted to Preprint", 1);
            await item.saveTx();

            this.log(`Successfully converted item ${item.id} to preprint`);
        } catch (error) {
            this.log(`Error converting item ${item.id} to preprint: ${error}`);
            throw error;
        }
    },

    // Find published version of arXiv preprint
    async findPublishedVersion(item) {
        let title = item.getField("title");
        if (!title) {
            this.log("No title found for item");
            return null;
        }
        
        this.log(`Finding published version for: "${title}"`);

        // Extract arXiv ID if available
        let arxivId = this.extractArxivId(item);
        this.log(`Extracted arXiv ID: ${arxivId || 'none'}`);
        
        // Try multiple strategies to find published version
        let doi = null;

        // Strategy 1: Search CrossRef with arXiv ID if available
        if (arxivId) {
            this.log(`Trying CrossRef search with arXiv ID: ${arxivId}`);
            doi = await this.searchCrossRefByArxivId(arxivId);
            if (doi) {
                this.log(`Found DOI via arXiv ID search: ${doi}`);
                return doi;
            } else {
                this.log("No DOI found via arXiv ID search");
            }
        }

        // Strategy 2: Search CrossRef by title (excluding preprint servers)
        this.log("Trying CrossRef search by title");
        doi = await this.searchCrossRefForPublishedVersion(item);
        if (doi) {
            this.log(`Found DOI via CrossRef title search: ${doi}`);
            return doi;
        } else {
            this.log("No DOI found via CrossRef title search");
        }

        // Strategy 3: Search Semantic Scholar (often has good preprint->published mappings)
        this.log("Trying Semantic Scholar search");
        doi = await this.searchSemanticScholarForPublishedVersion(item);
        if (doi) {
            this.log(`Found DOI via Semantic Scholar search: ${doi}`);
            return doi;
        } else {
            this.log("No DOI found via Semantic Scholar search");
        }

        this.log("No published version found using any strategy");
        return null;
    },

    // Extract arXiv ID from item
    extractArxivId(item) {
        // Check extra field
        let extra = item.getField("extra");
        if (extra) {
            let arxivMatch = extra.match(/arXiv[:\s]*(\d{4}\.\d{4,5})/i);
            if (arxivMatch) return arxivMatch[1];
        }

        // Check URL
        let url = item.getField("url");
        if (url) {
            let arxivMatch = url.match(/arxiv\.org\/abs\/(\d{4}\.\d{4,5})/i);
            if (arxivMatch) return arxivMatch[1];
        }

        return null;
    },

    // Search CrossRef by arXiv ID
    async searchCrossRefByArxivId(arxivId) {
        try {
            let query = encodeURIComponent(`arxiv:${arxivId}`);
            let url = `https://api.crossref.org/works?query=${query}&rows=5`;
            this.log(`CrossRef arXiv search URL: ${url}`);

            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                this.log(`CrossRef arXiv search returned ${data.message?.items?.length || 0} results`);
                if (data.message && data.message.items.length > 0) {
                    // Look for items that reference this arXiv ID
                    for (let work of data.message.items) {
                        this.log(`CrossRef result: ${work.title?.[0] || 'No title'} - Type: ${work.type} - DOI: ${work.DOI || 'No DOI'}`);
                        if (work.DOI && (work.type === "journal-article" || work.type === "proceedings-article")) {
                            this.log(`Found ${work.type} with DOI: ${work.DOI}`);
                            return Zotero.Utilities.cleanDOI(work.DOI);
                        }
                    }
                }
            } else {
                this.log(`CrossRef arXiv search failed with status: ${response.status}`);
            }
        } catch (error) {
            this.log("CrossRef arXiv ID search error: " + error);
        }
        return null;
    },

    // Search CrossRef for published version (excluding preprint servers)
    async searchCrossRefForPublishedVersion(item) {
        try {
            let title = item.getField("title");
            if (!title) return null;

            // Build search query
            let query = `title:"${title}"`;

            // Add author information
            let creators = item.getCreators();
            if (creators.length > 0) {
                let firstAuthor = creators[0];
                if (firstAuthor.lastName) {
                    query += ` author:"${firstAuthor.lastName}"`;
                }
            }

            let encodedQuery = encodeURIComponent(query);
            let url = `https://api.crossref.org/works?query=${encodedQuery}&rows=10`;
            this.log(`CrossRef title search URL: ${url}`);

            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                this.log(`CrossRef title search returned ${data.message?.items?.length || 0} results`);
                if (data.message && data.message.items.length > 0) {
                    // Look for journal articles (not preprints) with high title similarity
                    for (let work of data.message.items) {
                        if (work.DOI && work.title && (work.type === "journal-article" || work.type === "proceedings-article")) {
                            // Exclude known preprint servers
                            let isPreprint = false;
                            let containerTitle = "";
                            if (work["container-title"]) {
                                containerTitle = work["container-title"][0].toLowerCase();
                                if (containerTitle.includes("arxiv") || 
                                    containerTitle.includes("biorxiv") || 
                                    containerTitle.includes("medrxiv") ||
                                    containerTitle.includes("preprint")) {
                                    isPreprint = true;
                                }
                            }

                            let similarity = this.titleSimilarity(work.title[0], title);
                            this.log(`CrossRef result: "${work.title[0]}" in "${containerTitle}" - Type: ${work.type} - Similarity: ${similarity.toFixed(2)} - Preprint: ${isPreprint} - DOI: ${work.DOI}`);
                            
                            if (!isPreprint && similarity > 0.9) {
                                this.log(`Found matching published ${work.type} with DOI: ${work.DOI}`);
                                return Zotero.Utilities.cleanDOI(work.DOI);
                            }
                        }
                    }
                }
            } else {
                this.log(`CrossRef title search failed with status: ${response.status}`);
            }
        } catch (error) {
            this.log("CrossRef published version search error: " + error);
        }
        return null;
    },

    // Search Semantic Scholar for published version
    async searchSemanticScholarForPublishedVersion(item) {
        try {
            let title = item.getField("title");
            if (!title) return null;

            this.log("Starting Semantic Scholar exact search for published version");
            // Strategy 1: Try exact title + author search for published version
            let doi = await this.searchSemanticScholarExactPublished(item, title);
            if (doi) {
                this.log(`Found DOI via Semantic Scholar exact search: ${doi}`);
                return doi;
            }

            this.log("Starting Semantic Scholar relaxed search for published version");
            // Strategy 2: Try relaxed search for published version
            doi = await this.searchSemanticScholarRelaxedPublished(item, title);
            if (doi) {
                this.log(`Found DOI via Semantic Scholar relaxed search: ${doi}`);
                return doi;
            }

        } catch (error) {
            this.log("Semantic Scholar published version search error: " + error);
        }
        return null;
    },

    // Exact search for published version with title and author
    async searchSemanticScholarExactPublished(item, title) {
        try {
            // Build refined query with title and author
            let query = `title:"${title}"`;

            // Add first author
            let creators = item.getCreators();
            if (creators.length > 0) {
                let firstAuthor = creators[0];
                if (firstAuthor.lastName) {
                    query += ` author:"${firstAuthor.lastName}"`;
                    if (firstAuthor.firstName) {
                        query += ` author:"${firstAuthor.firstName}"`;
                    }
                }
            }

            let encodedQuery = encodeURIComponent(query);
            let url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodedQuery}&limit=5&fields=title,externalIds,venue`;

            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.data && data.data.length > 0) {
                    for (let paper of data.data) {
                        if (paper.title && paper.venue) {
                            // Exclude arXiv and other preprint venues
                            let venue = paper.venue.toLowerCase();
                            if (!venue.includes("arxiv") && 
                                !venue.includes("biorxiv") && 
                                !venue.includes("medrxiv") &&
                                !venue.includes("preprint")) {
                                
                                let similarity = this.titleSimilarity(paper.title, title);
                                if (similarity > 0.95) {
                                    this.log(`Semantic Scholar exact published match: ${paper.title} in ${paper.venue} (similarity: ${similarity.toFixed(2)})`);
                                    
                                    // Return DOI if available, otherwise return a special identifier for conference papers
                                    if (paper.externalIds && paper.externalIds.DOI) {
                                        return Zotero.Utilities.cleanDOI(paper.externalIds.DOI);
                                    } else {
                                        // For conference papers without DOI, return a special format
                                        this.log(`Conference paper found without DOI, using venue: ${paper.venue}`);
                                        return `VENUE:${paper.venue}|TITLE:${paper.title}`;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.log("Semantic Scholar exact published search error: " + error);
        }
        return null;
    },

    // Relaxed search for published version
    async searchSemanticScholarRelaxedPublished(item, title) {
        try {
            // Clean title for better matching
            let cleanTitle = title
                .replace(/[^\w\s]/g, ' ')
                .replace(/\b(the|a|an|and|or|but|in|on|at|to|for|of|with|by)\b/gi, '')
                .replace(/\s+/g, ' ')
                .trim();

            let encodedTitle = encodeURIComponent(cleanTitle);
            let url = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodedTitle}&limit=15&fields=title,externalIds,venue`;

            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.data && data.data.length > 0) {
                    for (let paper of data.data) {
                        if (paper.title && paper.venue) {
                            // Exclude arXiv and other preprint venues
                            let venue = paper.venue.toLowerCase();
                            if (!venue.includes("arxiv") && 
                                !venue.includes("biorxiv") && 
                                !venue.includes("medrxiv") &&
                                !venue.includes("preprint")) {
                                
                                let similarity = this.titleSimilarity(paper.title, title);
                                if (similarity > 0.9) {
                                    this.log(`Semantic Scholar relaxed published match: ${paper.title} in ${paper.venue} (similarity: ${similarity.toFixed(2)})`);
                                    
                                    // Return DOI if available, otherwise return a special identifier for conference papers
                                    if (paper.externalIds && paper.externalIds.DOI) {
                                        return Zotero.Utilities.cleanDOI(paper.externalIds.DOI);
                                    } else {
                                        // For conference papers without DOI, return a special format
                                        this.log(`Conference paper found without DOI, using venue: ${paper.venue}`);
                                        return `VENUE:${paper.venue}|TITLE:${paper.title}`;
                                    }
                                }
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.log("Semantic Scholar relaxed published search error: " + error);
        }
        return null;
    },

    // Update current item as published version
    async updateItemAsPublishedVersion(item, publishedInfo) {
        try {
            this.log(`Updating item ${item.id} as published version with info: ${publishedInfo}`);

            // Check if it's a DOI or venue info
            if (publishedInfo.startsWith("VENUE:")) {
                // Handle conference paper without DOI
                let parts = publishedInfo.split("|");
                let venue = parts[0].replace("VENUE:", "");
                let publishedTitle = parts[1].replace("TITLE:", "");
                
                this.log(`Updating as conference paper in venue: ${venue}`);
                
                // Determine item type based on venue
                let itemTypeID;
                let venueUpper = venue.toUpperCase();
                if (venueUpper.includes("CONFERENCE") || venueUpper.includes("PROCEEDINGS") || 
                    venueUpper.includes("NIPS") || venueUpper.includes("NEURIPS") ||
                    venueUpper.includes("NEURAL INFORMATION PROCESSING SYSTEMS") ||
                    venueUpper.includes("ICML") || venueUpper.includes("ICLR") ||
                    venueUpper.includes("SYMPOSIUM") || venueUpper.includes("WORKSHOP")) {
                    itemTypeID = Zotero.ItemTypes.getID("conferencePaper");
                } else {
                    itemTypeID = Zotero.ItemTypes.getID("journalArticle");
                }
                
                if (item.itemTypeID !== itemTypeID) {
                    item.setType(itemTypeID);
                }

                // Set the venue as proceedings title for conference papers
                if (itemTypeID === Zotero.ItemTypes.getID("conferencePaper")) {
                    item.setField("proceedingsTitle", venue);
                } else {
                    item.setField("publicationTitle", venue);
                }

                // Clear arXiv-specific fields
                item.setField("repository", "");
                
                this.log(`Successfully updated item ${item.id} as ${itemTypeID === Zotero.ItemTypes.getID("conferencePaper") ? "conference paper" : "journal article"}`);
            } else {
                // Handle journal article with DOI
                let metadata = await this.fetchCrossRefMetadata(publishedInfo);
                if (!metadata) {
                    this.log("Could not fetch metadata for published version");
                    return;
                }

                // Determine item type from metadata
                let itemTypeID;
                if (metadata.type === "proceedings-article") {
                    itemTypeID = Zotero.ItemTypes.getID("conferencePaper");
                } else {
                    itemTypeID = Zotero.ItemTypes.getID("journalArticle");
                }

                if (item.itemTypeID !== itemTypeID) {
                    item.setType(itemTypeID);
                }

                // Set the DOI
                item.setField("DOI", publishedInfo);

                // Clear arXiv-specific fields
                item.setField("repository", "");
                
                // Update with CrossRef metadata
                await this.updateItemWithMetadata(item, metadata);

                this.log(`Successfully updated item ${item.id} as published version with DOI`);
            }

            // Update any existing attachments to remove preprint references
            await this.updateAttachmentsForPublishedVersion(item);

        } catch (error) {
            this.log(`Error updating item as published version: ${error}`);
            throw error;
        }
    },

    // Create published version and merge attachments
    async createPublishedVersion(originalItem, publishedDOI) {
        try {
            this.log(`Creating published version for item ${originalItem.id} with DOI ${publishedDOI}`);

            // Fetch metadata for the published version
            let metadata = await this.fetchCrossRefMetadata(publishedDOI);
            if (!metadata) {
                this.log("Could not fetch metadata for published version");
                return;
            }

            // Create new journal article item
            let journalArticleTypeID = Zotero.ItemTypes.getID("journalArticle");
            let newItem = new Zotero.Item(journalArticleTypeID);

            // Set the DOI first
            newItem.setField("DOI", publishedDOI);

            // Copy basic information from original item
            let title = originalItem.getField("title");
            if (title) {
                newItem.setField("title", title);
            }

            // Copy creators
            let creators = originalItem.getCreators();
            creators.forEach(creator => {
                newItem.setCreator(newItem.numCreators(), creator);
            });

            // Save the new item first
            let newItemID = await newItem.saveTx();
            this.log(`Created new journal article item with ID: ${newItemID}`);

            // Update with CrossRef metadata
            await this.updateItemWithMetadata(newItem, metadata);

            // Add preprint suffix to original attachments and move them
            await this.moveAttachmentsWithPreprintSuffix(originalItem, newItem);

            // Try to download the published version PDF
            await this.downloadPublishedVersion(newItem, publishedDOI);

            // Add tags to both items
            originalItem.addTag("Preprint Version", 1);
            newItem.addTag("Published Version", 1);
            newItem.addTag("Created from arXiv", 1);

            await originalItem.saveTx();
            await newItem.saveTx();

            this.log(`Successfully created published version and processed attachments`);
        } catch (error) {
            this.log(`Error creating published version: ${error}`);
            throw error;
        }
    },

    // Update attachments for published version (remove preprint references)
    async updateAttachmentsForPublishedVersion(item) {
        try {
            let attachments = item.getAttachments();
            this.log(`Updating ${attachments.length} attachments for published version`);

            for (let attachmentID of attachments) {
                let attachment = Zotero.Items.get(attachmentID);
                if (attachment) {
                    // Remove preprint references from title
                    let currentTitle = attachment.getField("title");
                    if (currentTitle) {
                        let newTitle = currentTitle
                            .replace(/\s*\(preprint\)/gi, "")
                            .replace(/\s*\(arxiv\)/gi, "")
                            .replace(/\s*preprint\s*/gi, " ")
                            .replace(/\s+/g, " ")
                            .trim();
                        
                        if (newTitle !== currentTitle) {
                            attachment.setField("title", newTitle);
                            await attachment.saveTx();
                            this.log(`Updated attachment title from "${currentTitle}" to "${newTitle}"`);
                        }
                    }
                }
            }
        } catch (error) {
            this.log(`Error updating attachments for published version: ${error}`);
            throw error;
        }
    },

    // Move attachments from one item to another with preprint suffix
    async moveAttachmentsWithPreprintSuffix(fromItem, toItem) {
        try {
            let attachments = fromItem.getAttachments();
            this.log(`Moving ${attachments.length} attachments from item ${fromItem.id} to item ${toItem.id} with preprint suffix`);

            for (let attachmentID of attachments) {
                let attachment = Zotero.Items.get(attachmentID);
                if (attachment) {
                    // Add preprint suffix to title
                    let currentTitle = attachment.getField("title");
                    if (currentTitle && !currentTitle.toLowerCase().includes("preprint")) {
                        let newTitle = currentTitle + " (preprint)";
                        attachment.setField("title", newTitle);
                        this.log(`Added preprint suffix to attachment: ${newTitle}`);
                    }

                    // Change the parent item
                    attachment.parentItemID = toItem.id;
                    await attachment.saveTx();
                    this.log(`Moved attachment ${attachmentID} to new item with preprint suffix`);
                }
            }
        } catch (error) {
            this.log(`Error moving attachments with preprint suffix: ${error}`);
            throw error;
        }
    },

    // Download published version PDF
    async downloadPublishedVersion(item, publishedInfo) {
        try {
            this.log(`Attempting to find and download published version: ${publishedInfo}`);

            // Check if item already has a valid PDF attachment
            let hasExistingPDF = await this.itemHasPDF(item);
            if (hasExistingPDF) {
                this.log(`Item ${item.id} already has a valid PDF, skipping download`);
                item.addTag("Already Has PDF", 1);
                await item.saveTx();
                return;
            }

            // Check if it's a conference paper without DOI
            if (publishedInfo.startsWith("VENUE:")) {
                this.log("Conference paper without DOI detected, trying arXiv as fallback");
                
                // For conference papers without DOI, try to download the arXiv version
                let arxivPDF = await this.findArxivPDF(item);
                if (arxivPDF) {
                    this.log(`Found arXiv PDF: ${arxivPDF}`);
                    let downloadSuccess = await this.downloadFileForItem(item, arxivPDF, "Conference Paper (arXiv)");
                    if (downloadSuccess) {
                        item.addTag("Conference PDF Downloaded", 1);
                        item.addTag("PDF from arXiv", 1);
                    } else {
                        item.addTag("Conference PDF Download Failed", 1);
                    }
                } else {
                    this.log("No arXiv PDF found for conference paper");
                    item.addTag("No Conference PDF Found", 1);
                }
                await item.saveTx();
            } else {
                // Regular DOI-based download using the full file finding system
                let fileInfo = await this.findFileForItem(item);
                
                if (fileInfo.url) {
                    this.log(`Found published PDF at: ${fileInfo.url} (${fileInfo.source})`);
                    let downloadSuccess = await this.downloadFileForItem(item, fileInfo.url, `Published Version (${fileInfo.source})`);
                    if (downloadSuccess) {
                        item.addTag("Published PDF Downloaded", 1);
                        item.addTag(`PDF from ${fileInfo.source}`, 1);
                    } else {
                        item.addTag("Published PDF Download Failed", 1);
                    }
                    await item.saveTx();
                } else {
                    this.log(`No PDF found for published version: ${publishedInfo}`);
                    item.addTag("No Published PDF Found", 1);
                    await item.saveTx();
                }
            }
        } catch (error) {
            this.log(`Error finding published version: ${error}`);
            item.addTag("Published PDF Error", 1);
            await item.saveTx();
        }
    },

    // Find published PDF from multiple sources
    async findPublishedPDF(doi) {
        // Try Unpaywall first (best for open access)
        let pdfUrl = await this.findUnpaywallPDF(doi);
        if (pdfUrl) return pdfUrl;

        // Try CORE API
        pdfUrl = await this.findCorePDFByDOI(doi);
        if (pdfUrl) return pdfUrl;

        return null;
    },

    // Configure email preferences manually
    configureEmail() {
        try {
            let currentEmail = "";
            try {
                currentEmail = Zotero.Prefs.get("extensions.zotero.zotadata.email", true) || "";
            } catch (e) {
                // Ignore error, use empty string
            }

            // Use Zotero's main window for prompts
            let window = Zotero.getMainWindow();
            if (!window) {
                this.log("Could not get main window for email configuration");
                return;
            }

            let newEmail = window.prompt(
                "Configure Email for Zotadata\n\n" +
                "Your email is required for API access (Unpaywall, etc.) and will be stored locally in Zotero preferences.\n\n" +
                "Current email: " + (currentEmail || "(not set)") + "\n\n" +
                "Enter your email address (or leave empty to disable API features):",
                currentEmail
            );

            if (newEmail !== null) {
                if (newEmail.trim() === "") {
                    // User wants to clear the email
                    Zotero.Prefs.clear("extensions.zotero.zotadata.email", true);
                    this.log("Email preference cleared");
                    window.alert("Email cleared. API features (Unpaywall, etc.) will be disabled until you configure an email.");
                } else if (newEmail.includes("@")) {
                    // Valid email provided
                    Zotero.Prefs.set("extensions.zotero.zotadata.email", newEmail.trim(), true);
                    this.log("Email preference updated: " + newEmail.trim());
                    window.alert("Email configured successfully: " + newEmail.trim());
                } else {
                    // Invalid email
                    window.alert("Invalid email address. Please enter a valid email or leave empty to disable API features.");
                }
            }
        } catch (error) {
            this.log("Error configuring email: " + error);
            try {
                let window = Zotero.getMainWindow();
                if (window) {
                    window.alert("Error configuring email: " + error);
                }
            } catch (alertError) {
                this.log("Could not show error alert: " + alertError);
            }
        }
    },

    // Get configured email from preferences or prompt user
    getConfiguredEmail() {
        try {
            // Try to get from Zotero preferences
            let email = Zotero.Prefs.get("extensions.zotero.zotadata.email", true);
            if (email && email.trim() !== "" && email.includes("@")) {
                return email.trim();
            }
        } catch (e) {
            this.log("Error reading email preference: " + e);
        }
        
        // Fallback: prompt user for email using Zotero's main window
        try {
            let window = Zotero.getMainWindow();
            if (!window) {
                this.log("Could not get main window for email prompt");
                return null;
            }

            let email = window.prompt(
                "Zotadata needs your email address for API access (Unpaywall, etc.).\n\n" +
                "Your email will be stored locally in Zotero preferences and only used for API requests.\n\n" +
                "Please enter your email address:"
            );
            
            if (email && email.trim() !== "" && email.includes("@")) {
                email = email.trim();
                // Save to preferences for future use
                Zotero.Prefs.set("extensions.zotero.zotadata.email", email, true);
                this.log("Email configured and saved to preferences: " + email);
                return email;
            } else if (email !== null && email.trim() !== "") {
                // User entered something but it's invalid
                window.alert("Invalid email address. Please use the 'Configure Email' menu to set a valid email or cancel to skip API features.");
            }
        } catch (promptError) {
            this.log("Error prompting for email: " + promptError);
        }
        
        return null;
    },

    // Find PDF via Unpaywall API
    async findUnpaywallPDF(doi) {
        try {
            // Get email from preferences or prompt user
            let email = this.getConfiguredEmail();
            if (!email) {
                this.log("No email configured for Unpaywall API. Skipping Unpaywall search.");
                return null;
            }

            let url = `https://api.unpaywall.org/v2/${doi}?email=${encodeURIComponent(email)}`;
            
            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.is_oa && data.best_oa_location && data.best_oa_location.url_for_pdf) {
                    return data.best_oa_location.url_for_pdf;
                }
            }
        } catch (error) {
            this.log("Unpaywall PDF search error: " + error);
        }
        return null;
    },

    // Find PDF via CORE API using DOI
    async findCorePDFByDOI(doi) {
        try {
            let query = encodeURIComponent(`doi:"${doi}"`);
            let url = `https://api.core.ac.uk/v3/search/works?q=${query}&limit=5`;
            
            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    Accept: "application/json",
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.results && data.results.length > 0) {
                    for (let result of data.results) {
                        if (result.downloadUrl && result.downloadUrl.endsWith('.pdf')) {
                            return result.downloadUrl;
                        }
                    }
                }
            }
        } catch (error) {
            this.log("CORE PDF search error: " + error);
        }
        return null;
    },

    // Download and attach file to item
    async downloadAndAttachFile(item, fileUrl, titleSuffix = "") {
        try {
            this.log(`Downloading file from: ${fileUrl}`);

            // Validate URL
            if (!fileUrl || typeof fileUrl !== 'string') {
                throw new Error("Invalid URL provided for download");
            }

            // Clean URL to fix common issues
            let cleanUrl = this.cleanDownloadUrl(fileUrl);
            
            // Check if URL looks valid
            try {
                new URL(cleanUrl);
            } catch (urlError) {
                throw new Error(`Invalid URL format after cleaning: ${cleanUrl}`);
            }

            // Create title for attachment
            let title = item.getField("title");
            if (titleSuffix) {
                title = title + ` (${titleSuffix})`;
            }

            let attachment = null;

            try {
                // Method 1: Try Zotero's built-in attachment import (creates stored file)
                this.log(`Attempting importFromURL for stored file: ${title}`);
                this.log(`Using cleaned URL: ${cleanUrl}`);
                
                attachment = await Zotero.Attachments.importFromURL({
                    url: cleanUrl,
                    parentItemID: item.id,
                    title: title,
                    fileBaseName: this.sanitizeFileName(title),
                    contentType: "application/pdf",
                    libraryID: item.libraryID || Zotero.Libraries.userLibraryID
                });
                
                if (attachment && this.verifyStoredAttachment(attachment)) {
                    this.log(`Successfully created stored PDF attachment: ${title}`);
                    return attachment;
                } else if (attachment) {
                    this.log(`ImportFromURL created attachment but it's not a stored file, trying manual method`);
                    // Don't return here, fall through to manual method
                } else {
                    this.log(`ImportFromURL returned null, trying manual method`);
                }
            } catch (importError) {
                this.log(`ImportFromURL failed: ${importError}, trying manual download method`);
            }

            // Method 2: Manual download and import (guaranteed stored file)
            try {
                this.log(`Attempting manual download and import for: ${title}`);
                attachment = await this.manualDownloadAndImport(item, cleanUrl, title);
                
                if (attachment && this.verifyStoredAttachment(attachment)) {
                    this.log(`Successfully created stored PDF via manual method: ${title}`);
                    return attachment;
                } else {
                    throw new Error("Manual method failed to create valid stored attachment");
                }
            } catch (manualError) {
                this.log(`Manual download failed: ${manualError}`);
                throw new Error(`All stored file download methods failed. Manual: ${manualError}`);
            }

            throw new Error("Failed to create stored PDF attachment - no attachment object returned");
        } catch (error) {
            this.log(`Error downloading PDF as stored file: ${error}`);
            throw error;
        }
    },

    // Manual download and import method for stored files
    async manualDownloadAndImport(item, fileUrl, title) {
        let tempFile = null;
        try {
            // Clean and validate URL first
            let cleanUrl = this.cleanDownloadUrl(fileUrl);
            this.log(`Manually downloading file from cleaned URL: ${cleanUrl}`);
            
            let response = await Zotero.HTTP.request("GET", cleanUrl, {
                responseType: "arraybuffer",
                headers: {
                    "User-Agent": "Zotero Zotadata/1.0",
                    "Accept": "application/pdf,*/*",
                    "Referer": new URL(cleanUrl).origin,
                },
                timeout: 30000,  // 30 second timeout
                followRedirects: true
            });

            if (response.status !== 200) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            // Validate response data
            if (!response.response || response.response.byteLength === 0) {
                throw new Error("Empty response received from server");
            }

            // Convert to Uint8Array for proper binary handling
            let data = new Uint8Array(response.response);
            this.log(`Downloaded ${data.length} bytes`);

            // Validate that this is actually a PDF file
            if (!this.validatePDFData(data)) {
                throw new Error("Downloaded data is not a valid PDF file");
            }

            // Use a different approach that doesn't trigger NetUtil error
            return await this.createAttachmentFromData(item, data, title);

        } catch (error) {
            this.log(`Manual download and import error: ${error}`);
            throw error;
        }
    },

    // Validate that downloaded data is actually a PDF
    validatePDFData(data) {
        try {
            // Check minimum size
            if (data.length < 1024) {
                this.log("Data too small to be a valid PDF");
                this.debugDownloadedContent(data);
                return false;
            }

            // Check PDF magic number at start
            let header = new TextDecoder('ascii', { fatal: false }).decode(data.slice(0, 8));
            if (!header.startsWith('%PDF-')) {
                this.log(`Invalid PDF header: ${header}`);
                this.debugDownloadedContent(data);
                return false;
            }

            // Check PDF trailer at end (look for %%EOF)
            let trailer = new TextDecoder('ascii', { fatal: false }).decode(data.slice(-100));
            if (!trailer.includes('%%EOF')) {
                this.log("PDF trailer not found - file may be truncated");
                // Don't fail here as some PDFs might have extra data after %%EOF
            }

            this.log(`Valid PDF detected: ${header.trim()}, size: ${data.length} bytes`);
            return true;

        } catch (error) {
            this.log(`PDF validation error: ${error}`);
            this.debugDownloadedContent(data);
            return false;
        }
    },

    // Debug downloaded content to see what we actually received
    debugDownloadedContent(data) {
        try {
            if (!data || data.length === 0) {
                this.log("DEBUG: No data to analyze");
                return;
            }

            this.log(`DEBUG: Analyzing ${data.length} bytes of downloaded content`);

            // Check first 500 bytes as text
            let startText = new TextDecoder('utf-8', { fatal: false }).decode(data.slice(0, 500));
            this.log(`DEBUG: First 500 chars as text: ${startText.substring(0, 200)}...`);

            // Check if it's HTML
            if (startText.toLowerCase().includes('<!doctype html') || 
                startText.toLowerCase().includes('<html') ||
                startText.toLowerCase().includes('<head>') ||
                startText.toLowerCase().includes('<body>')) {
                this.log("DEBUG: Content appears to be HTML");
                
                // Look for specific error indicators
                if (startText.toLowerCase().includes('ddos-guard')) {
                    this.log("DEBUG: Content is DDoS-Guard protection page");
                } else if (startText.toLowerCase().includes('cloudflare')) {
                    this.log("DEBUG: Content is Cloudflare protection page");
                } else if (startText.toLowerCase().includes('access denied') || 
                          startText.toLowerCase().includes('forbidden')) {
                    this.log("DEBUG: Content is access denied page");
                } else {
                    this.log("DEBUG: Content is generic HTML page");
                }
                return;
            }

            // Check if it's JSON
            if (startText.trim().startsWith('{') || startText.trim().startsWith('[')) {
                this.log("DEBUG: Content appears to be JSON");
                try {
                    let jsonData = JSON.parse(startText);
                    this.log(`DEBUG: JSON content: ${JSON.stringify(jsonData).substring(0, 200)}...`);
                } catch (jsonError) {
                    this.log("DEBUG: Could not parse as JSON");
                }
                return;
            }

            // Check binary signatures
            let hex = Array.from(data.slice(0, 16))
                           .map(b => b.toString(16).padStart(2, '0'))
                           .join(' ');
            this.log(`DEBUG: First 16 bytes as hex: ${hex}`);

            // Check for gzip/compression
            if (data[0] === 0x1f && data[1] === 0x8b) {
                this.log("DEBUG: Content appears to be gzipped");
            }

            // Check for ZIP file (sometimes PDFs are in ZIP containers)
            if (data[0] === 0x50 && data[1] === 0x4b) {
                this.log("DEBUG: Content appears to be ZIP file");
            }

        } catch (debugError) {
            this.log(`DEBUG: Error analyzing content: ${debugError}`);
        }
    },

    // Create attachment from downloaded data without using temp files
    async createAttachmentFromData(item, data, title) {
        try {
            this.log(`Creating attachment from ${data.length} bytes of PDF data`);
            
            // Double-check the data is still valid before creating blob
            if (!this.validatePDFData(data)) {
                throw new Error("PDF data is no longer valid before blob creation");
            }

            // Create a blob URL from the data with explicit PDF MIME type
            let blob = new Blob([data.buffer || data], { type: 'application/pdf' });
            this.log(`Created blob with size: ${blob.size} bytes, type: ${blob.type}`);
            
            // Verify blob size matches original data
            if (blob.size !== data.length) {
                throw new Error(`Blob size mismatch: expected ${data.length}, got ${blob.size}`);
            }
            
            let blobUrl = URL.createObjectURL(blob);
            this.log(`Created blob URL: ${blobUrl.substring(0, 50)}... (${blob.size} bytes)`);

            try {
                // Try to import from the blob URL with more specific options
                let attachment = await Zotero.Attachments.importFromURL({
                    url: blobUrl,
                    parentItemID: item.id,
                    title: title,
                    fileBaseName: this.sanitizeFileName(title),
                    contentType: "application/pdf",
                    libraryID: item.libraryID || Zotero.Libraries.userLibraryID
                });

                if (attachment && this.verifyStoredAttachment(attachment)) {
                    this.log(`Successfully created stored attachment from blob: ${title}`);
                    return attachment;
                } else {
                    throw new Error("Blob import failed or didn't create stored file");
                }
            } finally {
                // Clean up blob URL
                URL.revokeObjectURL(blobUrl);
                this.log("Blob URL cleaned up");
            }
        } catch (blobError) {
            this.log(`Blob method failed: ${blobError}, trying legacy temp file method`);
            
            // Fallback: Use legacy temp file method with better error handling
            return await this.createAttachmentFromDataLegacy(item, data, title);
        }
    },

    // Legacy temp file method with improved error handling
    async createAttachmentFromDataLegacy(item, data, title) {
        let tempFile = null;
        try {
            // Create temporary file with unique name to avoid conflicts
            let tempDir = Zotero.getTempDirectory();
            tempFile = tempDir.clone();
            let filename = this.sanitizeFileName(title) + "_" + Date.now() + "_" + Math.random().toString(36).substr(2, 9) + ".pdf";
            tempFile.append(filename);
            
            // Make sure temp file doesn't already exist
            if (tempFile.exists()) {
                tempFile.remove(false);
            }

            // Use a different method to write the file that preserves binary data
            try {
                // Method 1: Try OS.File if available (modern approach, handles binary correctly)
                if (typeof OS !== 'undefined' && OS.File && OS.File.writeAtomic) {
                    // Ensure we're writing raw binary data
                    let arrayBuffer = data.buffer || data;
                    if (arrayBuffer instanceof Uint8Array) {
                        arrayBuffer = arrayBuffer.buffer.slice(arrayBuffer.byteOffset, arrayBuffer.byteOffset + arrayBuffer.byteLength);
                    }
                    await OS.File.writeAtomic(tempFile.path, new Uint8Array(arrayBuffer));
                    this.log(`Wrote file using OS.File.writeAtomic: ${tempFile.path}`);
                } else {
                    // Method 2: Use nsIFileOutputStream with proper binary mode
                    let fileStream = Components.classes["@mozilla.org/network/file-output-stream;1"]
                                              .createInstance(Components.interfaces.nsIFileOutputStream);
                    
                    // Open in binary mode to preserve PDF structure
                    fileStream.init(tempFile, 0x02 | 0x08 | 0x20, 0o644, 0);
                    
                    // Use binary output stream for proper binary data handling
                    let binaryStream = Components.classes["@mozilla.org/binaryoutputstream;1"]
                                                .createInstance(Components.interfaces.nsIBinaryOutputStream);
                    binaryStream.setOutputStream(fileStream);
                    
                    // Write data in chunks to avoid memory issues with large files
                    let chunkSize = 65536; // 64KB chunks
                    let offset = 0;
                    
                    while (offset < data.length) {
                        let chunkLength = Math.min(chunkSize, data.length - offset);
                        let chunk = data.slice(offset, offset + chunkLength);
                        
                        // Convert Uint8Array to string for binary stream
                        let binaryString = String.fromCharCode.apply(null, chunk);
                        binaryStream.writeBytes(binaryString, binaryString.length);
                        
                        offset += chunkLength;
                    }
                    
                    binaryStream.close();
                    fileStream.close();
                    this.log(`Wrote file using nsIBinaryOutputStream: ${tempFile.path}`);
                }
            } catch (writeError) {
                throw new Error(`Failed to write temp file: ${writeError}`);
            }

            // Verify file was written successfully
            if (!tempFile.exists() || tempFile.fileSize === 0) {
                throw new Error("Failed to write file to temporary location");
            }

            // Additional verification: check if written file size matches
            if (tempFile.fileSize !== data.length) {
                this.log(`Warning: File size mismatch. Expected: ${data.length}, Actual: ${tempFile.fileSize}`);
                // Don't fail here, but log the discrepancy
            }

            this.log(`Created temp file: ${tempFile.path} (${tempFile.fileSize} bytes)`);

            // Validate the written file is still a valid PDF
            await this.validateWrittenPDFFile(tempFile);

            // Import the temporary file as a stored attachment
            let attachment = await Zotero.Attachments.importFromFile({
                file: tempFile,
                parentItemID: item.id,
                title: title
            });

            if (!attachment) {
                throw new Error("Failed to create attachment from imported file");
            }

            this.log(`Successfully imported legacy temp file as stored attachment: ${title}`);
            return attachment;

        } finally {
            // Always clean up temp file, even if something failed
            if (tempFile && tempFile.exists()) {
                try {
                    tempFile.remove(false);
                    this.log(`Cleaned up temporary file: ${tempFile.path}`);
                } catch (cleanupError) {
                    this.log(`Warning: Could not clean up temp file: ${cleanupError}`);
                }
            }
        }
    },

    // Validate written PDF file
    async validateWrittenPDFFile(tempFile) {
        try {
            // Read first few bytes to check PDF header
            let fileStream = Components.classes["@mozilla.org/network/file-input-stream;1"]
                                      .createInstance(Components.interfaces.nsIFileInputStream);
            fileStream.init(tempFile, 0x01, 0o444, 0);
            
            let binaryStream = Components.classes["@mozilla.org/binaryinputstream;1"]
                                        .createInstance(Components.interfaces.nsIBinaryInputStream);
            binaryStream.setInputStream(fileStream);
            
            // Read first 8 bytes for PDF header
            let headerBytes = binaryStream.readBytes(8);
            fileStream.close();
            
            if (!headerBytes.startsWith('%PDF-')) {
                throw new Error(`Written file has invalid PDF header: ${headerBytes}`);
            }
            
            this.log(`Written PDF file validated: ${headerBytes.trim()}`);
        } catch (error) {
            this.log(`Warning: Could not validate written PDF file: ${error}`);
            // Don't throw error here, just log warning
        }
    },

    // Clean URLs to fix common issues
    cleanDownloadUrl(url) {
        if (!url) return url;
        
        try {
            // Remove fragment identifiers and extra parameters that might cause issues
            let cleanUrl = url.split('#')[0];
            
            // Fix double slashes in path
            cleanUrl = cleanUrl.replace(/([^:]\/)\/+/g, '$1');
            
            // Remove problematic query parameters
            let urlObj = new URL(cleanUrl);
            urlObj.searchParams.delete('navpanes');
            urlObj.searchParams.delete('view');
            
            return urlObj.toString();
        } catch (error) {
            this.log(`URL cleaning failed, using original: ${error}`);
            return url;
        }
    },

    // Sanitize filename for attachment
    sanitizeFileName(filename) {
        if (!filename) return "attachment";
        
        // Remove or replace problematic characters
        return filename
            .replace(/[<>:"/\\|?*]/g, "_")  // Replace invalid filename characters
            .replace(/\s+/g, "_")          // Replace spaces with underscores
            .substring(0, 100)             // Limit length
            .trim();
    },

    // Find Missing Files functionality
    async findSelectedFiles() {
        this.log("findSelectedFiles called");
        let selectedItems = Zotero.getActiveZoteroPane().getSelectedItems();
        this.log("Selected items count: " + selectedItems.length);

        if (!selectedItems.length) {
            this.log("No items selected");
            this.showDialog('Please select items to find missing files.');
            return;
        }

        // Filter for items that don't have PDF attachments
        let itemsNeedingFiles = [];
        for (let item of selectedItems) {
            let itemType = Zotero.ItemTypes.getName(item.itemTypeID);
            if (itemType === "journalArticle" || itemType === "conferencePaper" || itemType === "preprint" || itemType === "book") {
                let hasPDF = await this.itemHasPDF(item);
                if (!hasPDF) {
                    itemsNeedingFiles.push(item);
                    this.log(`Added ${itemType} item ${item.id} to processing list (no PDF found)`);
                }
            } else {
                this.log(`Skipping unsupported item type: ${itemType} (item ${item.id})`);
            }
        }

        if (!itemsNeedingFiles.length) {
            this.showDialog('All selected items already have PDF attachments or are not supported item types.');
            return;
        }

        this.log(`Finding and downloading files for ${itemsNeedingFiles.length} items`);

        // Use the modular batch processor with very conservative settings for file downloads
        let batchResult = await this.processBatch(
            itemsNeedingFiles,
            async (item) => {
                let fileInfo = await this.findFileForItem(item);
                
                if (fileInfo.url) {
                    this.log(`Found file for item ${item.id}: ${fileInfo.url} (${fileInfo.source})`);
                    
                    // Download the file
                    let downloadResult = await this.downloadFileForItem(item, fileInfo.url, fileInfo.source);
                    return {
                        found: true,
                        downloaded: downloadResult,
                        source: fileInfo.source
                    };
                } else {
                    this.log(`No file found for item ${item.id}`);
                    item.addTag("No PDF Found", 1);
                    await item.saveTx();
                    return {
                        found: false,
                        downloaded: false,
                        source: null
                    };
                }
            },
            {
                batchSize: 2,
                delayBetweenBatches: 2000,
                progressTitle: "Finding Missing Files",
                progressThreshold: 10
            }
        );

        if (!batchResult.success) {
            this.showDialog("Error during file search batch processing: " + batchResult.error);
            return;
        }

        // Aggregate file search-specific statistics
        let foundCount = 0;
        let downloadedCount = 0;

        for (let result of batchResult.results) {
            if (result.result) {
                if (result.result.found) foundCount++;
                if (result.result.downloaded) downloadedCount++;
            }
        }

        // Show file search-specific summary
        let findRate = foundCount > 0 ? Math.round((foundCount / batchResult.totalProcessed) * 100) : 0;
        let downloadRate = foundCount > 0 ? Math.round((downloadedCount / foundCount) * 100) : 0;
        
        let customLines = [
            `🔍 Files found: ${foundCount}`,
            `💾 Files downloaded: ${downloadedCount}`,
            `📈 Find rate: ${findRate}%`,
            `📈 Download success: ${downloadRate}%`
        ];
        
        this.showGenericBatchSummary(
            batchResult,
            "📁 File Search Results",
            customLines
        );
    },

    // Check if item has PDF attachment
    async itemHasPDF(item) {
        let attachments = item.getAttachments();
        for (let attachmentID of attachments) {
            let attachment = Zotero.Items.get(attachmentID);
            if (attachment && attachment.isPDFAttachment()) {
                // Check if file actually exists
                try {
                    let file = attachment.getFile();
                    if (file && file.exists()) {
                        return true;
                    }
                } catch (error) {
                    // File doesn't exist, continue checking
                }
            }
        }
        return false;
    },

    // Find file URL for individual item (no downloading)
    async findFileForItem(item) {
        try {
            let itemType = Zotero.ItemTypes.getName(item.itemTypeID);
            this.log(`Finding file for ${itemType} item ${item.id}`);
            
            let doi = this.extractDOI(item);
            let isbn = this.extractISBN(item);

            // Different strategy for books vs articles
            if (itemType === "book") {
                this.log("Using book-specific file finding strategy");
                
                // Book-specific sources (multiple approaches)
                if (isbn) {
                    // 1. Try Internet Archive first (often has legal book scans)
                    let iaUrl = await this.findInternetArchiveBook(item, isbn);
                    if (iaUrl) {
                        return { url: iaUrl, source: "Internet Archive" };
                    }
                    
                    // 2. Try OpenLibrary direct downloads
                    let olUrl = await this.findOpenLibraryPDF(item, isbn);
                    if (olUrl) {
                        return { url: olUrl, source: "OpenLibrary" };
                    }
                    
                    // 3. Try Library Genesis with ISBN (books are well-represented here)
                    let libgenUrl = await this.findLibGenPDF(null, item, isbn);
                    if (libgenUrl) {
                        return { url: libgenUrl, source: "Library Genesis" };
                    }
                }
                
                // 4. Try Library Genesis with title/author (fallback for books without ISBN)
                let libgenUrl = await this.findLibGenPDF(null, item);
                if (libgenUrl) {
                    return { url: libgenUrl, source: "Library Genesis" };
                }
                
                // 5. Try Google Books preview/full access
                let gbUrl = await this.findGoogleBooksFullText(item, isbn);
                if (gbUrl) {
                    return { url: gbUrl, source: "Google Books" };
                }
                
                // 6. Try DOI-based sources if book has DOI
                if (doi) {
                    let resolverResult = await this.tryCustomResolvers(doi);
                    if (resolverResult.url) {
                        return { url: resolverResult.url, source: resolverResult.source };
                    }
                }
                
            } else {
                this.log("Using article-specific file finding strategy");
                
                // Article-specific sources (DOI-based first)
                // 1. Try Unpaywall (open access)
                if (doi) {
                    let fileUrl = await this.findUnpaywallPDF(doi);
                    if (fileUrl) {
                        return { url: fileUrl, source: "Unpaywall" };
                    }
                }

                // 2. Try arXiv
                let arxivUrl = await this.findArxivPDF(item);
                if (arxivUrl) {
                    return { url: arxivUrl, source: "arXiv" };
                }

                // 3. Try CORE API
                if (doi) {
                    let coreUrl = await this.findCorePDFByDOI(doi);
                    if (coreUrl) {
                        return { url: coreUrl, source: "CORE" };
                    }
                }

                // 4. Try Library Genesis (also good for articles)
                if (doi) {
                    let libgenUrl = await this.findLibGenPDF(doi, item);
                    if (libgenUrl) {
                        return { url: libgenUrl, source: "Library Genesis" };
                    }
                }

                // 5. Try Custom Resolvers (Sci-Hub style)
                if (doi) {
                    let resolverResult = await this.tryCustomResolvers(doi);
                    if (resolverResult.url) {
                        return { url: resolverResult.url, source: resolverResult.source };
                    }
                }
            }

            this.log(`No file found for ${itemType} item ${item.id}`);
            return { url: null, source: null };

        } catch (error) {
            this.log(`Error finding file for item ${item.id}: ${error}`);
            return { url: null, source: null };
        }
    },

    // Download and attach file for item
    async downloadFileForItem(item, fileUrl, source) {
        try {
            await this.downloadAndAttachFile(item, fileUrl, source);
            item.addTag(`PDF from ${source}`, 1);
            await item.saveTx();
            this.log(`Successfully downloaded and attached PDF from ${source}`);
            return true;
        } catch (downloadError) {
            this.log(`Error downloading PDF from ${source}: ${downloadError}`);
            item.addTag("Download Failed", 1);
            await item.saveTx();
            return false;
        }
    },

    // Find arXiv PDF
    async findArxivPDF(item) {
        try {
            // Check if this is an arXiv item
            let arxivId = this.extractArxivId(item);
            if (arxivId) {
                // arXiv PDF URL format
                return `http://arxiv.org/pdf/${arxivId}.pdf`;
            }

            // Try searching arXiv by title
            let title = item.getField("title");
            if (title) {
                let arxivResult = await this.searchArxiv(title);
                if (arxivResult) {
                    return `http://arxiv.org/pdf/${arxivResult}.pdf`;
                }
            }
        } catch (error) {
            this.log("arXiv PDF search error: " + error);
        }
        return null;
    },

    // Search arXiv API
    async searchArxiv(title) {
        try {
            let query = encodeURIComponent(`ti:"${title}"`);
            let url = `http://export.arxiv.org/api/query?search_query=${query}&max_results=3`;

            let response = await Zotero.HTTP.request("GET", url, {
                headers: {
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                // Parse XML response
                let parser = new DOMParser();
                let xmlDoc = parser.parseFromString(response.responseText, "text/xml");
                let entries = xmlDoc.getElementsByTagName("entry");

                for (let entry of entries) {
                    let entryTitle = entry.getElementsByTagName("title")[0]?.textContent;
                    if (entryTitle && this.titleSimilarity(entryTitle, title) > 0.8) {
                        let id = entry.getElementsByTagName("id")[0]?.textContent;
                        if (id) {
                            // Extract arXiv ID from URL
                            let match = id.match(/arxiv\.org\/abs\/(.+)$/);
                            if (match) {
                                return match[1];
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.log("arXiv search error: " + error);
        }
        return null;
    },

    // Library Genesis integration (direct API calls)
    async findLibGenPDF(doi, item, isbn = null) {
        try {
            // Try searching by ISBN first for books (if provided)
            if (isbn) {
                this.log(`Searching LibGen by ISBN: ${isbn}`);
                let result = await this.searchLibGen(`isbn:${isbn}`);
                if (result) return result;
                
                // Also try ISBN without prefix
                result = await this.searchLibGen(isbn);
                if (result) return result;
            }
            
            // Try searching by DOI first (for articles)
            if (doi) {
                this.log(`Searching LibGen by DOI: ${doi}`);
                let result = await this.searchLibGen(`doi:${doi}`);
                if (result) return result;
            }

            // Try searching by title
            let title = item.getField("title");
            if (title) {
                this.log(`Searching LibGen by title: ${title}`);
                let result = await this.searchLibGen(title);
                if (result) return result;
            }

            // Try searching by title + author
            let authors = item.getCreators()
                .filter(creator => creator.creatorType === "author")
                .map(creator => creator.lastName || creator.name)
                .join(" ");
            
            if (title && authors) {
                this.log(`Searching LibGen by title + author: ${title} ${authors}`);
                let result = await this.searchLibGen(`${title} ${authors}`);
                if (result) return result;
            }

        } catch (error) {
            this.log("LibGen search error: " + error);
        }
        return null;
    },

    // Search Library Genesis API
    async searchLibGen(query) {
        try {
            // Use multiple LibGen mirrors
            let mirrors = [
                "http://libgen.is",
                "http://gen.lib.rus.ec"
            ];

            for (let mirror of mirrors) {
                try {
                    let result = await this.searchLibGenMirror(mirror, query);
                    if (result) return result;
                } catch (mirrorError) {
                    this.log(`LibGen mirror ${mirror} failed: ${mirrorError}`);
                    continue;
                }
            }
        } catch (error) {
            this.log("LibGen search error: " + error);
        }
        return null;
    },

    // Search specific LibGen mirror
    async searchLibGenMirror(mirror, query) {
        try {
            this.log(`Searching LibGen mirror ${mirror} for: ${query}`);
            
            // LibGen search endpoint
            let searchUrl = `${mirror}/search.php?req=${encodeURIComponent(query)}&lg_topic=libgen&open=0&view=simple&res=25&phrase=1&column=def`;

            let response = await Zotero.HTTP.request("GET", searchUrl, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                },
                timeout: 20000,  // Longer timeout for LibGen
                followRedirects: true
            });

            if (response.status === 200) {
                this.log(`LibGen search returned ${response.responseText.length} characters`);
                
                // Check for blocking pages
                if (response.responseText.includes('DDoS-Guard') || 
                    response.responseText.includes('Cloudflare') ||
                    response.responseText.includes('checking your browser')) {
                    this.log(`LibGen mirror ${mirror} is blocked by protection system`);
                    return null;
                }
                
                // Parse HTML response to find download links
                let parser = new DOMParser();
                let doc = parser.parseFromString(response.responseText, "text/html");
                
                // Look for different types of download links
                let downloadLinks = doc.querySelectorAll('a[href*="book/index.php?md5="], a[href*="/book/"], a[href*="md5="]');
                this.log(`Found ${downloadLinks.length} potential download links`);
                
                if (downloadLinks.length > 0) {
                    // Try the first few results
                    for (let i = 0; i < Math.min(3, downloadLinks.length); i++) {
                        let bookLink = downloadLinks[i].href;
                        if (!bookLink.startsWith('http')) {
                            bookLink = mirror + '/' + bookLink.replace(/^\//, '');
                        }
                        
                        this.log(`Trying LibGen book link ${i + 1}: ${bookLink}`);
                        
                        // Get the actual download URL
                        let downloadUrl = await this.getLibGenDownloadUrl(bookLink);
                        if (downloadUrl) {
                            return downloadUrl;
                        }
                    }
                } else {
                    this.log(`No download links found in LibGen response for query: ${query}`);
                }
            } else {
                this.log(`LibGen mirror ${mirror} returned status ${response.status}`);
            }
        } catch (error) {
            this.log(`LibGen mirror search error for ${mirror}: ${error}`);
        }
        return null;
    },

    // Get actual download URL from LibGen book page
    async getLibGenDownloadUrl(bookPageUrl) {
        try {
            let response = await Zotero.HTTP.request("GET", bookPageUrl, {
                headers: {
                    "User-Agent": "Zotero Zotadata/1.0",
                },
            });

            if (response.status === 200) {
                let parser = new DOMParser();
                let doc = parser.parseFromString(response.responseText, "text/html");
                
                // Look for direct download links
                let downloadLinks = doc.querySelectorAll('a[href*=".pdf"], a[href*="get.php"], a[href*="download"]');
                
                for (let link of downloadLinks) {
                    let href = link.href;
                    if (href && (href.includes('.pdf') || href.includes('get.php') || href.includes('download'))) {
                        // Make sure URL is absolute
                        if (!href.startsWith('http')) {
                            let baseUrl = new URL(bookPageUrl).origin;
                            href = baseUrl + '/' + href.replace(/^\//, '');
                        }
                        return href;
                    }
                }
            }
        } catch (error) {
            this.log("LibGen download URL error: " + error);
        }
        return null;
    },

    // Internet Archive book search
    async findInternetArchiveBook(item, isbn) {
        try {
            this.log(`Searching Internet Archive for ISBN: ${isbn}`);
            
            // Internet Archive search by ISBN
            let query = encodeURIComponent(`isbn:${isbn}`);
            let searchUrl = `https://archive.org/advancedsearch.php?q=${query}&fl=identifier,title,creator&rows=5&page=1&output=json`;
            
            let response = await Zotero.HTTP.request("GET", searchUrl, {
                headers: {
                    "User-Agent": "Zotero Zotadata/1.0",
                    "Accept": "application/json",
                },
                timeout: 15000
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.response && data.response.docs && data.response.docs.length > 0) {
                    for (let doc of data.response.docs) {
                        if (doc.identifier) {
                            // Check if full text is available
                            let pdfUrl = await this.checkInternetArchivePDF(doc.identifier);
                            if (pdfUrl) {
                                this.log(`Found Internet Archive PDF: ${pdfUrl}`);
                                return pdfUrl;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.log(`Internet Archive search error: ${error}`);
        }
        return null;
    },

    // Check if Internet Archive item has downloadable PDF
    async checkInternetArchivePDF(identifier) {
        try {
            let metadataUrl = `https://archive.org/metadata/${identifier}`;
            let response = await Zotero.HTTP.request("GET", metadataUrl, {
                headers: {
                    "User-Agent": "Zotero Zotadata/1.0",
                    "Accept": "application/json",
                },
                timeout: 10000
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.files) {
                    // Look for PDF files
                    for (let file of data.files) {
                        if (file.name.endsWith('.pdf') && file.source === 'original') {
                            return `https://archive.org/download/${identifier}/${file.name}`;
                        }
                    }
                }
            }
        } catch (error) {
            this.log(`Internet Archive metadata error: ${error}`);
        }
        return null;
    },

    // OpenLibrary PDF search
    async findOpenLibraryPDF(item, isbn) {
        try {
            this.log(`Searching OpenLibrary for downloadable PDF with ISBN: ${isbn}`);
            
            // OpenLibrary book details by ISBN
            let bookUrl = `https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=details`;
            let response = await Zotero.HTTP.request("GET", bookUrl, {
                headers: {
                    "User-Agent": "Zotero Zotadata/1.0",
                    "Accept": "application/json",
                },
                timeout: 15000
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                let key = `ISBN:${isbn}`;
                if (data[key] && data[key].details) {
                    let details = data[key].details;
                    
                    // Check for Internet Archive integration (many OpenLibrary books link to IA)
                    if (details.ocaid) {
                        let pdfUrl = await this.checkInternetArchivePDF(details.ocaid);
                        if (pdfUrl) {
                            this.log(`Found OpenLibrary->IA PDF: ${pdfUrl}`);
                            return pdfUrl;
                        }
                    }
                    
                    // Check for direct download links in OpenLibrary
                    if (details.links) {
                        for (let link of details.links) {
                            if (link.url && link.url.includes('.pdf')) {
                                this.log(`Found OpenLibrary direct PDF: ${link.url}`);
                                return link.url;
                            }
                        }
                    }
                }
            }
        } catch (error) {
            this.log(`OpenLibrary PDF search error: ${error}`);
        }
        return null;
    },

    // Google Books full text search
    async findGoogleBooksFullText(item, isbn) {
        try {
            this.log(`Searching Google Books for full text access`);
            
            let query = isbn ? `isbn:${isbn}` : `intitle:"${item.getField('title')}"`;
            let searchUrl = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=3`;
            
            let response = await Zotero.HTTP.request("GET", searchUrl, {
                headers: {
                    "User-Agent": "Zotero Zotadata/1.0",
                    "Accept": "application/json",
                },
                timeout: 15000
            });

            if (response.status === 200) {
                let data = JSON.parse(response.responseText);
                if (data.items && data.items.length > 0) {
                    for (let book of data.items) {
                        if (book.accessInfo && book.accessInfo.pdf && 
                            book.accessInfo.pdf.isAvailable && 
                            book.accessInfo.pdf.downloadLink) {
                            this.log(`Found Google Books PDF: ${book.accessInfo.pdf.downloadLink}`);
                            return book.accessInfo.pdf.downloadLink;
                        }
                        
                        // Also check for web reader access that might be downloadable
                        if (book.accessInfo && book.accessInfo.webReaderLink && 
                            book.accessInfo.accessViewStatus === 'FULL_PUBLIC_DOMAIN') {
                            // For public domain books, construct potential PDF URL
                            let volumeId = book.id;
                            let possiblePdfUrl = `https://books.google.com/books/download?id=${volumeId}&output=pdf`;
                            this.log(`Trying Google Books public domain PDF: ${possiblePdfUrl}`);
                            return possiblePdfUrl;
                        }
                    }
                }
            }
        } catch (error) {
            this.log(`Google Books full text search error: ${error}`);
        }
        return null;
    },

    // Custom resolver system (like Sci-Hub)
    async tryCustomResolvers(doi) {
        let resolvers = this.getCustomResolvers();
        
        for (let resolver of resolvers) {
            try {
                let result = await this.tryCustomResolver(resolver, doi);
                if (result) {
                    return { url: result, source: resolver.name };
                }
            } catch (error) {
                this.log(`Custom resolver ${resolver.name} failed: ${error}`);
                continue;
            }
        }
        
        return { url: null, source: null };
    },

    // Get list of custom resolvers
    getCustomResolvers() {
        return [
            // Sci-Hub resolvers (similar to the provided snippet)
            {
                name: "Sci-Hub",
                method: "GET",
                url: "https://sci-hub.se/{doi}",
                mode: "html",
                selector: "#pdf",
                attribute: "src",
                automatic: true
            },
            {
                name: "Sci-Hub",
                method: "GET", 
                url: "https://sci-hub.st/{doi}",
                mode: "html",
                selector: "#pdf",
                attribute: "src",
                automatic: true
            },
            {
                name: "Sci-Hub",
                method: "GET",
                url: "https://sci-hub.ru/{doi}",
                mode: "html", 
                selector: "#pdf",
                attribute: "src",
                automatic: true
            }
        ];
    },

    // Try individual custom resolver
    async tryCustomResolver(resolver, doi) {
        try {
            let url = resolver.url.replace('{doi}', encodeURIComponent(doi));
            this.log(`Trying ${resolver.name} resolver: ${url}`);
            
            let response = await Zotero.HTTP.request(resolver.method, url, {
                headers: {
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
                    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                    "Accept-Language": "en-US,en;q=0.5",
                },
                timeout: 15000,  // Shorter timeout for blocked sites
                followRedirects: true
            });

            // Check for common blocking responses
            if (response.status === 403) {
                this.log(`${resolver.name} returned 403 (likely blocked by DDoS protection)`);
                return null;
            }

            if (response.status === 200) {
                let responseText = response.responseText;
                
                // Check for DDoS protection pages
                if (responseText.includes('DDoS-Guard') || 
                    responseText.includes('Cloudflare') ||
                    responseText.includes('checking your browser') ||
                    responseText.includes('ddos-guard')) {
                    this.log(`${resolver.name} is protected by DDoS guard, skipping`);
                    return null;
                }

                // Check for Sci-Hub specific blocking indicators
                if (responseText.includes('blocked') || 
                    responseText.includes('not available') ||
                    responseText.includes('suspended')) {
                    this.log(`${resolver.name} appears to be blocked or suspended`);
                    return null;
                }

                if (resolver.mode === "html") {
                    let parser = new DOMParser(); 
                    let doc = parser.parseFromString(responseText, "text/html");
                    let element = doc.querySelector(resolver.selector);
                    
                    if (element) {
                        let pdfUrl = null;
                        if (resolver.attribute) {
                            pdfUrl = element.getAttribute(resolver.attribute);
                        } else {
                            pdfUrl = element.textContent;
                        }
                        
                        if (pdfUrl) {
                            // Clean and validate the URL
                            let cleanPdfUrl = this.cleanScihubUrl(pdfUrl, url);
                            if (cleanPdfUrl) {
                                this.log(`${resolver.name} found PDF URL: ${cleanPdfUrl}`);
                                return cleanPdfUrl;
                            }
                        }
                    } else {
                        this.log(`${resolver.name} did not find expected element: ${resolver.selector}`);
                    }
                } else if (resolver.mode === "json") {
                    let data = JSON.parse(responseText);
                    if (resolver.mappings && resolver.mappings.url) {
                        // Navigate to the URL field in JSON
                        let pdfUrl = this.getNestedProperty(data, resolver.mappings.url);
                        if (pdfUrl) return pdfUrl;
                    }
                }
            } else {
                this.log(`${resolver.name} returned status ${response.status}`);
            }
        } catch (error) {
            this.log(`Custom resolver ${resolver.name} error: ${error}`);
        }
        return null;
    },

    // Clean Sci-Hub URLs to fix common issues
    cleanScihubUrl(pdfUrl, baseUrl) {
        if (!pdfUrl) return null;
        
        try {
            // Make URL absolute if needed
            if (!pdfUrl.startsWith('http')) {
                let baseUrlObj = new URL(baseUrl);
                if (pdfUrl.startsWith('//')) {
                    pdfUrl = baseUrlObj.protocol + pdfUrl;
                } else if (pdfUrl.startsWith('/')) {
                    pdfUrl = baseUrlObj.origin + pdfUrl;
                } else {
                    pdfUrl = baseUrlObj.origin + '/' + pdfUrl;
                }
            }
            
            // Fix common Sci-Hub URL issues
            pdfUrl = pdfUrl.replace(/\/+/g, '/').replace(':/', '://');
            
            // Validate the URL looks like a PDF
            if (pdfUrl.includes('.pdf') || pdfUrl.includes('dacemirror') || pdfUrl.includes('download')) {
                return pdfUrl;
            } else {
                this.log(`URL doesn't look like a PDF: ${pdfUrl}`);
                return null;
            }
        } catch (error) {
            this.log(`Error cleaning Sci-Hub URL: ${error}`);
            return null;
        }
    },

    // Utility to get nested property from object
    getNestedProperty(obj, path) {
        return path.split('.').reduce((current, key) => current && current[key], obj);
    },

    // Verify that attachment is a stored file
    verifyStoredAttachment(attachment) {
        if (!attachment) {
            return false;
        }

        try {
            // Check if it's an imported (stored) file
            let linkMode = attachment.attachmentLinkMode;
            let isStoredFile = linkMode === Zotero.Attachments.LINK_MODE_IMPORTED_FILE ||
                              linkMode === Zotero.Attachments.LINK_MODE_IMPORTED_URL;

            if (isStoredFile) {
                // Additional check: verify file exists in Zotero storage
                let file = attachment.getFile();
                if (file && file.exists()) {
                    this.log(`Verified stored attachment: ${attachment.getField("title")} (${file.path})`);
                    return true;
                } else {
                    this.log(`Warning: Stored attachment file missing: ${attachment.getField("title")}`);
                    return false;
                }
            } else {
                this.log(`Warning: Attachment is not a stored file (linkMode: ${linkMode}): ${attachment.getField("title")}`);
                return false;
            }
        } catch (error) {
            this.log(`Error verifying stored attachment: ${error}`);
            return false;
        }
    }
};

Zotero.log("AttachmentFinder: Object created successfully");
