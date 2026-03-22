/**
 * Bootstrap entry point for Zotero 8
 * Zotero 8 requires ESM modules and native promises
 */

// Define bootstrap constants
const APP_SHUTDOWN = 2;

// Ensure Services is available (auto-imported in Firefox 140+)
if (typeof Services === 'undefined') {
  var { Services } = ChromeUtils.importESModule("resource://gre/modules/Services.sys.mjs");
}

// Global reference to the plugin instance
let Zotadata = null;

/**
 * Called when the extension is installed or updated
 */
async function install(data, reason) {
  // Called when the add-on is first installed
}

/**
 * Called when the extension is uninstalled
 */
async function uninstall(data, reason) {
  // Called when the add-on is uninstalled
}

/**
 * Called when the extension starts up
 */
async function startup({ id, version, rootURI }, reason) {
  try {
    // Load main plugin logic using the resource URI
    // In Zotero 8, we use scriptloader for the main module
    Services.scriptloader.loadSubScript(rootURI + "zotadata.js");

    // Initialize the plugin
    if (Zotadata && Zotadata.init) {
      Zotadata.init({ id, version, rootURI });
    }

    // Initialize the plugin global
    const windowListener = {
      onOpenWindow: (xulWindow) => {
        const window = xulWindow.QueryInterface(Ci.nsIInterfaceRequestor)
          .getInterface(Ci.nsIDOMWindow);
        window.addEventListener("load", () => {
          if (window.ZoteroPane && Zotadata?.addToWindow) {
            Zotadata.addToWindow(window);
          }
        }, { once: true });
      },
      onCloseWindow: () => {},
      onWindowTitleChange: () => {}
    };

    // Store window listener for cleanup
    Services.wm.addListener(windowListener);

    // Add to existing windows
    const windows = Services.wm.getEnumerator("navigator:browser");
    while (windows.hasMoreElements()) {
      const window = windows.getNext();
      if (window.ZoteroPane) {
        Zotadata?.addToWindow?.(window);
      }
    }

    // Store reference for cleanup
    if (Zotadata) {
      Zotadata.windowListener = windowListener;
      Zotadata.rootURI = rootURI;
      Zotadata.version = version;
      Zotadata.id = id;
    }

  } catch (error) {
    console.error(`Zotadata startup error: ${error}`);
  }
}

/**
 * Called when the extension shuts down
 */
async function shutdown(data, reason) {
  if (reason === APP_SHUTDOWN) return;

  if (Zotadata) {
    // Remove from all windows
    Zotadata.removeFromAllWindows?.();

    // Unregister notifier if registered
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

    Zotadata = null;
  }
}

// Export for ESM
export { install, uninstall, startup, shutdown };