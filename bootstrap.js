const { classes: Cc, interfaces: Ci, utils: Cu } = Components;

Cu.import("resource://gre/modules/Services.jsm");

var Zotadata;

function startup({ id, version, rootURI }, reason) {
    // Load main plugin logic
    Services.scriptloader.loadSubScript(rootURI + "zotadata.js");

    // Initialize plugin
    Zotadata.init({ id, version, rootURI });
    Zotadata.addToAllWindows();

    // Listen for new windows
    var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
    var windowListener = {
        onOpenWindow: function(xulWindow) {
            var window = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
                                  .getInterface(Ci.nsIDOMWindow);
            window.addEventListener("load", function() {
                if (window.ZoteroPane) {
                    Zotadata.addToWindow(window);
                }
            }, false);
        },
        onCloseWindow: function(xulWindow) {},
        onWindowTitleChange: function(xulWindow, newTitle) {}
    };
    wm.addListener(windowListener);

    // Store reference to remove later
    Zotadata.windowListener = windowListener;
}

function shutdown(data, reason) {
    if (reason == APP_SHUTDOWN) return;

    if (Zotadata) {
        // Remove from all windows
        Zotadata.removeFromAllWindows();

        // Unregister notifier
        if (Zotadata.notifierID) {
            Zotero.Notifier.unregisterObserver(Zotadata.notifierID);
        }

        // Remove window listener
        if (Zotadata.windowListener) {
            var wm = Cc["@mozilla.org/appshell/window-mediator;1"].getService(Ci.nsIWindowMediator);
            wm.removeListener(Zotadata.windowListener);
        }

        // Close any open progress windows
        if (Zotadata.progressWindow) {
            Zotadata.progressWindow.close();
        }
    }
}

function install(data, reason) {
    // Called when the add-on is first installed
}

function uninstall(data, reason) {
    // Called when the add-on is uninstalled
}
