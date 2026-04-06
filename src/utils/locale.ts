/**
 * Attach this add-on's Fluent bundles to a main window document so
 * `document.l10n.translateFragment` can resolve `data-l10n-id` on MenuManager items.
 *
 * Do not use `registerChrome` with a 3-element `locale` row — Zotero expects a
 * 4-tuple per locale (`locale`, package, `en-US`, `locale/en-US/`), and the wrong
 * shape throws NS_ERROR_ILLEGAL_VALUE. Loading via insertFTLIfNeeded matches common
 * Zotero plugins (e.g. zotero-format-metadata) and works with packaged chrome.manifest.
 */

const FTL_STEMS = ['mainWindow', 'addon', 'preferences'] as const;
const DEFAULT_LOCALE = 'en-US';

export function registerWindowFluent(win: Window): void {
  const ref = addon.data.config.addonRef;
  const moz = (win as unknown as { MozXULElement?: { insertFTLIfNeeded?: (href: string) => void } })
    .MozXULElement;
  if (typeof moz?.insertFTLIfNeeded !== 'function') {
    return;
  }

  for (const stem of FTL_STEMS) {
    const href = `${ref}-${stem}.ftl`;
    try {
      moz.insertFTLIfNeeded(href);
    } catch {
      // Optional bundles (e.g. preferences) may be absent in some builds.
    }
  }
}

type LocaleServices = {
  locale?: {
    appLocaleAsBCP47?: string;
  };
};

function getTrimmedLocale(value: string | null | undefined): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

export function getPreferredLocale(): string {
  const runtime = globalThis as typeof globalThis & {
    Services?: LocaleServices;
    Zotero?: typeof Zotero & {
      locale?: string;
    };
  };
  const zoteroLocale = getTrimmedLocale(runtime.Zotero?.locale);
  if (zoteroLocale) {
    return zoteroLocale;
  }

  const appLocale = getTrimmedLocale(runtime.Services?.locale?.appLocaleAsBCP47);
  if (appLocale) {
    return appLocale;
  }

  return DEFAULT_LOCALE;
}

export function getPrimaryLanguageSubtag(locale: string | null | undefined): string | null {
  if (!locale) {
    return null;
  }

  const normalized = locale.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const [primary] = normalized.split(/[-_]/);
  return primary || null;
}

export function matchesPreferredLanguage(language: string | null | undefined): boolean {
  const candidateLanguage = getPrimaryLanguageSubtag(language);
  if (!candidateLanguage) {
    return true;
  }

  const preferredLanguage = getPrimaryLanguageSubtag(getPreferredLocale());
  return candidateLanguage === preferredLanguage;
}

export function buildAcceptLanguageHeader(locale = getPreferredLocale()): string {
  const primaryLanguage = getPrimaryLanguageSubtag(locale);
  if (!primaryLanguage) {
    return `${DEFAULT_LOCALE},en;q=0.9`;
  }

  if (primaryLanguage === locale.toLowerCase()) {
    return locale;
  }

  return `${locale},${primaryLanguage};q=0.9`;
}
