/**
 * Bootstrap entry point for Zotero 8
 * Updated for ESM modules and Firefox 140+
 */

const APP_SHUTDOWN = 2;

// ESM import for Services (Zotero 8 / Firefox 140+)
if (typeof Services === 'undefined') {
  var { Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");
}

var Zotadata;

function startup({ id, version, rootURI }, reason) {
  try {
    // Load main plugin logic
    Services.scriptloader.loadSubScript(rootURI + "chrome/content/scripts/zotadata.js");

    // Initialize plugin
    if (typeof Zotadata !== 'undefined' && Zotadata.init) {
      Zotadata.init({ id, version, rootURI });
      Zotadata.addToAllWindows();
    }

    // Listen for new windows
    const windowListener = {
      onOpenWindow: (xulWindow) => {
        const window = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIDOMWindow);
        window.addEventListener("load", () => {
          if (window.ZoteroPane && Zotadata && Zotadata.addToWindow) {
            Zotadata.addToWindow(window);
          }
        }, { once: true });
      },
      onCloseWindow: () => {},
      onWindowTitleChange: () => {}
    };

    Services.wm.addListener(windowListener);

    // Store reference to remove later
    if (Zotadata) {
      Zotadata.windowListener = windowListener;
    }
  } catch (error) {
    Components.utils.reportError(`Zotadata startup error: ${error}`);
  }
}

function shutdown(data, reason) {
  if (reason === APP_SHUTDOWN) return;

  if (Zotadata) {
    // Remove from all windows
    if (Zotadata.removeFromAllWindows) {
      Zotadata.removeFromAllWindows();
    }

    // Unregister notifier
    if (Zotadata.notifierID) {
      Zotero.Notifier.unregisterObserver(Zotadata.notifierID);
    }

    // Remove window listener
    if (Zotadata.windowListener) {
      Services.wm.removeListener(Zotadata.windowListener);
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