import pkg from "../package.json";
import { ZotadataPlugin } from "./plugin";
import { registerWindowFluent } from "@/utils/locale";

async function onStartup(): Promise<void> {
  await Promise.all([
    Zotero.initializationPromise,
    Zotero.unlockPromise,
    Zotero.uiReadyPromise,
  ]);

  const plugin = new ZotadataPlugin();
  addon.data.plugin = plugin;

  await plugin.init({
    id: addon.data.config.addonID,
    version: pkg.version,
    rootURI: typeof rootURI !== "undefined" ? rootURI : "",
  });

  await Promise.all(
    Zotero.getMainWindows().map((win) => onMainWindowLoad(win)),
  );

  addon.data.initialized = true;
}

async function onMainWindowLoad(win: Window): Promise<void> {
  registerWindowFluent(win);
  await addon.data.plugin?.onMainWindowReady(win);
}

async function onMainWindowUnload(_win: Window): Promise<void> {
  ztoolkit.unregisterAll();
}

async function onShutdown(): Promise<void> {
  await addon.data.plugin?.shutdown();
  ztoolkit.unregisterAll();
  addon.data.alive = false;
  delete (Zotero as Record<string, unknown>)[addon.data.config.addonInstance];
}

async function onNotify(
  _event: string,
  _type: string,
  _ids: Array<string | number>,
  _extraData: { [key: string]: unknown },
): Promise<void> {
  // Reserved for future notifier wiring
}

async function onPrefsEvent(
  _type: string,
  _data: { [key: string]: unknown },
): Promise<void> {
  // Reserved for preferences pane
}

function onShortcuts(_type: string): void {
  // Reserved
}

function onDialogEvents(_type: string): void {
  // Reserved
}

export default {
  onStartup,
  onShutdown,
  onMainWindowLoad,
  onMainWindowUnload,
  onNotify,
  onPrefsEvent,
  onShortcuts,
  onDialogEvents,
};
