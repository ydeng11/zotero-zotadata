const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");

var AttachmentFinder;

function startup({ id, version, rootURI }, reason) {
    // Load main plugin logic
    Services.scriptloader.loadSubScript(rootURI + "attachment-finder.js");

    // Initialize plugin
    AttachmentFinder.init({ id, version, rootURI });
    AttachmentFinder.addToAllWindows();

    // Listen for new windows
    var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
    var windowListener = {
        onOpenWindow: function(xulWindow) {
            var window = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                  .getInterface(Ci.nsIDOMWindow);
            window.addEventListener("load", function() {
                if (window.ZoteroPane) {
                    AttachmentFinder.addToWindow(window);
                }
            }, false);
        },
        onCloseWindow: function(xulWindow) {},
        onWindowTitleChange: function(xulWindow, newTitle) {}
    };
    wm.addListener(windowListener);

    // Store reference to remove later
    AttachmentFinder.windowListener = windowListener;
}

function shutdown(data, reason) {
    if (reason == APP_SHUTDOWN) return;

    if (AttachmentFinder) {
        // Remove from all windows
        AttachmentFinder.removeFromAllWindows();

        // Unregister notifier
        if (AttachmentFinder.notifierID) {
            Zotero.Notifier.unregisterObserver(AttachmentFinder.notifierID);
        }

        // Remove window listener
        if (AttachmentFinder.windowListener) {
            var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
            wm.removeListener(AttachmentFinder.windowListener);
        }

        // Close any open progress windows
        if (AttachmentFinder.progressWindow) {
            AttachmentFinder.progressWindow.close();
        }
    }
}

function install(data, reason) {
    // Called when the add-on is first installed
}

function uninstall(data, reason) {
    // Called when the add-on is uninstalled
}
