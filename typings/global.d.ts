declare const _globalThis: {
  [key: string]: unknown;
  Zotero: _ZoteroTypes.Zotero;
  ztoolkit: ZToolkit;
  addon: typeof addon;
};

type ZToolkit = ReturnType<
  typeof import('../src/utils/ztoolkit').createZToolkit
>;

declare const ztoolkit: ZToolkit;

declare const rootURI: string;

declare const addon: import('../src/addon').default;

declare const __env__: 'production' | 'development';
