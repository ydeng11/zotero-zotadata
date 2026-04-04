import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FileFinder } from '@/modules/FileFinder';

function makeMockItem(overrides: Record<string, unknown> = {}): Zotero.Item {
  const fields: Record<string, string> = {
    title: 'Test Paper Title',
    DOI: '10.1234/test.2024',
    date: '2024',
    extra: '',
    ...(overrides.fields as Record<string, string> | undefined),
  };

  return {
    id: (overrides.id as number) ?? 1,
    isRegularItem: () => (overrides.isRegular as boolean) ?? true,
    getField: (f: string) => fields[f] ?? '',
    getCreators: () =>
      (overrides.creators as Array<{
        firstName: string;
        lastName: string;
        creatorType: string;
      }>) ?? [{ firstName: 'Jane', lastName: 'Doe', creatorType: 'author' }],
    getAttachments: () => (overrides.attachmentIds as number[]) ?? [],
    isAttachment: () => false,
  } as unknown as Zotero.Item;
}

describe('FileFinder', () => {
  let finder: FileFinder;
  let mockOpenAlex: { searchOpenAccess: ReturnType<typeof vi.fn> };
  let mockS2: { searchOpenAccess: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    mockOpenAlex = { searchOpenAccess: vi.fn().mockResolvedValue([]) };
    mockS2 = { searchOpenAccess: vi.fn().mockResolvedValue([]) };

    finder = new FileFinder(
      mockOpenAlex as any,
      mockS2 as any,
    );
  });

  it('skips non-regular items', async () => {
    const item = makeMockItem({ isRegular: false });
    const result = await finder.processItem(item);
    expect(result.outcome).toBe('skipped_not_regular');
  });

  it('reports already_has_file when a stored attachment exists', async () => {
    const attachments = new Map<number, unknown>();
    attachments.set(100, {
      isAttachment: () => true,
      attachmentLinkMode: 2,
      fileExists: vi.fn().mockResolvedValue(true),
    });

    vi.stubGlobal('Zotero', {
      ...globalThis.Zotero,
      Items: { get: (id: number) => attachments.get(id) ?? null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
      },
    });

    const item = makeMockItem({ attachmentIds: [100] });
    const result = await finder.processItem(item);

    expect(result.outcome).toBe('already_has_file');
    vi.unstubAllGlobals();
  });

  it('returns no_source_found when no API has a PDF', async () => {
    vi.stubGlobal('Zotero', {
      ...globalThis.Zotero,
      Items: { get: () => null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
      },
      HTTP: {
        request: vi.fn().mockResolvedValue({
          status: 404,
          responseText: '{}',
        }),
      },
    });

    const item = makeMockItem();
    const result = await finder.processItem(item);

    expect(result.outcome).toBe('no_source_found');
    vi.unstubAllGlobals();
  });

  it('downloads PDF when OpenAlex returns an OA result', async () => {
    const importFromURL = vi.fn().mockResolvedValue({ id: 200 });

    vi.stubGlobal('Zotero', {
      ...globalThis.Zotero,
      Items: { get: () => null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
        importFromURL,
      },
      HTTP: {
        request: vi.fn().mockResolvedValue({
          status: 404,
          responseText: '{}',
        }),
      },
    });

    mockOpenAlex.searchOpenAccess.mockResolvedValue([
      {
        title: 'Test Paper Title',
        authors: ['Jane Doe'],
        doi: '10.1234/test.2024',
        pdfUrl: 'https://example.com/paper.pdf',
        confidence: 0.9,
        source: 'OpenAlex',
      },
    ]);

    const item = makeMockItem();
    const result = await finder.processItem(item);

    expect(result.outcome).toBe('downloaded');
    expect(result.source).toBe('OpenAlex');
    expect(importFromURL).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://example.com/paper.pdf',
        parentItemID: 1,
      }),
    );

    vi.unstubAllGlobals();
  });

  it('prefers Unpaywall when DOI is available', async () => {
    const importFromURL = vi.fn().mockResolvedValue({ id: 201 });

    vi.stubGlobal('Zotero', {
      ...globalThis.Zotero,
      Items: { get: () => null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
        importFromURL,
      },
      HTTP: {
        request: vi.fn().mockResolvedValue({
          status: 200,
          responseText: JSON.stringify({
            is_oa: true,
            best_oa_location: {
              url_for_pdf: 'https://unpaywall.example.com/paper.pdf',
            },
          }),
        }),
      },
    });

    const item = makeMockItem();
    const result = await finder.processItem(item);

    expect(result.outcome).toBe('downloaded');
    expect(result.source).toBe('Unpaywall');
    expect(importFromURL).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://unpaywall.example.com/paper.pdf',
      }),
    );
    expect(mockOpenAlex.searchOpenAccess).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
  });

  it('falls through to Semantic Scholar if others fail', async () => {
    const importFromURL = vi.fn().mockResolvedValue({ id: 202 });

    vi.stubGlobal('Zotero', {
      ...globalThis.Zotero,
      Items: { get: () => null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
        importFromURL,
      },
      HTTP: {
        request: vi.fn().mockResolvedValue({
          status: 404,
          responseText: '{}',
        }),
      },
    });

    mockOpenAlex.searchOpenAccess.mockResolvedValue([]);
    mockS2.searchOpenAccess.mockResolvedValue([
      {
        title: 'Test Paper Title',
        authors: ['Jane Doe'],
        pdfUrl: 'https://s2.example.com/paper.pdf',
        confidence: 0.85,
        source: 'Semantic Scholar',
      },
    ]);

    const item = makeMockItem();
    const result = await finder.processItem(item);

    expect(result.outcome).toBe('downloaded');
    expect(result.source).toBe('Semantic Scholar');

    vi.unstubAllGlobals();
  });

  it('reports download_failed when importFromURL throws', async () => {
    vi.stubGlobal('Zotero', {
      ...globalThis.Zotero,
      log: () => {},
      Items: { get: () => null },
      Attachments: {
        ...globalThis.Zotero.Attachments,
        LINK_MODE_LINKED_URL: 1,
        importFromURL: vi.fn().mockRejectedValue(new Error('Network error')),
      },
      HTTP: {
        request: vi.fn().mockResolvedValue({
          status: 200,
          responseText: JSON.stringify({
            is_oa: true,
            best_oa_location: { url_for_pdf: 'https://example.com/bad.pdf' },
          }),
        }),
      },
    });

    const item = makeMockItem();
    const result = await finder.processItem(item);

    expect(result.outcome).toBe('download_failed');
    expect(result.error).toContain('Network error');

    vi.unstubAllGlobals();
  });

  describe('buildSearchQuery', () => {
    it('extracts DOI, title, authors, year, and arXiv ID', () => {
      const item = makeMockItem({
        fields: {
          title: 'Attention Is All You Need',
          DOI: '10.5555/3295222.3295349',
          date: '2017',
          extra: 'arXiv: 1706.03762',
        },
        creators: [
          { firstName: 'Ashish', lastName: 'Vaswani', creatorType: 'author' },
        ],
      });

      const query = FileFinder.buildSearchQuery(item);

      expect(query.title).toBe('Attention Is All You Need');
      expect(query.doi).toBe('10.5555/3295222.3295349');
      expect(query.year).toBe(2017);
      expect(query.authors).toEqual(['Ashish Vaswani']);
      expect(query.arxivId).toBe('1706.03762');
    });
  });

  describe('formatSummary', () => {
    it('formats mixed results', () => {
      const item = makeMockItem();
      const results = [
        { item, outcome: 'downloaded' as const, source: 'OpenAlex' },
        { item, outcome: 'downloaded' as const, source: 'Unpaywall' },
        { item, outcome: 'already_has_file' as const },
        { item, outcome: 'no_source_found' as const },
        { item, outcome: 'download_failed' as const, error: 'timeout' },
      ];

      const summary = FileFinder.formatSummary(results, 5);

      expect(summary).toContain('5 item(s) checked');
      expect(summary).toContain('2 PDFs downloaded');
      expect(summary).toContain('OpenAlex');
      expect(summary).toContain('Unpaywall');
      expect(summary).toContain('1 already had files');
      expect(summary).toContain('1 — no open-access PDF found');
      expect(summary).toContain('1 download failed');
    });

    it('handles zero-action summary', () => {
      const summary = FileFinder.formatSummary([], 0);
      expect(summary).toContain('Nothing to do');
    });
  });
});
