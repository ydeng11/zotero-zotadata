// Minimal AttachmentFinder plugin for debugging
Zotero.log("AttachmentFinder: Script loading started");

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

AttachmentFinder = {
    id: null,
    version: null,
    rootURI: null,
    addedElementIDs: [],
    notifierID: null,

    log(msg) {
        Zotero.log("Attachment Finder: " + msg);
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
            itemmenu.id = "zotero-itemmenu-attachment-finder-menu";
            itemmenu.setAttribute("class", "menu-iconic");
            itemmenu.setAttribute("label", "Attachment Finder");

            let itemmenupopup = _create(doc, "menupopup");
            itemmenupopup.id = "zotero-itemmenu-attachment-finder-menupopup";

            let checkAttachments = _create(doc, "menuitem");
            checkAttachments.id = "zotero-itemmenu-attachment-finder-check";
            checkAttachments.setAttribute("label", "Check Attachments");
            checkAttachments.addEventListener("command", () => {
                this.log("Check Attachments menu item clicked");
                AttachmentFinder.checkSelectedItems();
            });

            itemmenupopup.appendChild(checkAttachments);
            itemmenu.appendChild(itemmenupopup);

            let parentMenu = doc.getElementById("zotero-itemmenu");
            if (parentMenu) {
                parentMenu.appendChild(itemmenu);
                this.storeAddedElement(itemmenu);
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

        // Process each item
        for (let item of selectedItems) {
            this.log("Processing item: " + item.id);
            await this.simpleAttachmentCheck(item);
        }
    },

    // Show dialog using Zotero's system
    showDialog(message) {
        try {
            // Use Zotero's built-in dialog
            const prompts = Components.classes["@mozilla.org/embedcomp/prompt-service;1"]
                                      .getService(Components.interfaces.nsIPromptService);
            prompts.alert(null, "Attachment Finder", message);
        } catch (error) {
            this.log("Error showing dialog: " + error);
            // Fallback to console
            this.log("Dialog message: " + message);
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
    }
};

Zotero.log("AttachmentFinder: Object created successfully");
