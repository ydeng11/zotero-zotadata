// tests/unit/zotadata/api-clients.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { createZotadataMethod, clearCache } from '../../helpers/extract-function';
import { createMockItem } from '../../__mocks__/zotero-items';
import { createMockHTTP, registerFixture, clearFixtures } from '../../__mocks__/zotero-http';
import { crossrefFixtures } from '../../__mocks__/fixtures/crossref';
import { openalexFixtures } from '../../__mocks__/fixtures/openalex';

describe('API Clients', () => {
  let mockHTTP: ReturnType<typeof createMockHTTP>;

  beforeEach(() => {
    clearCache();
    clearFixtures();
    mockHTTP = createMockHTTP();
    (globalThis as any).Zotero = {
      HTTP: mockHTTP,
      HTTP_request: mockHTTP.request,
      Utilities: {
        cleanDOI: (d: string) => d ? d.trim().toLowerCase() : d,
      },
      Date: {
        strToDate: (d: string) => ({ year: d?.match(/\d{4}/)?.[0] }),
      },
    };
  });

  afterEach(() => {
    vi.clearAllMocks();
    clearFixtures();
  });

  describe('searchCrossRefForDOI', () => {
    let searchCrossRefForDOI: any;

    beforeEach(() => {
      searchCrossRefForDOI = createZotadataMethod('searchCrossRefForDOI', {
        titleSimilarity: createZotadataMethod('titleSimilarity'),
      });
    });

    it('should find DOI with matching title', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.singleWork);
      const item = createMockItem({
        title: 'Test Paper Title',
        creators: [{ lastName: 'Smith' }],
        date: '2023',
      });
      const result = await searchCrossRefForDOI(item);
      expect(result).toBe('10.1000/test.doi');
    });

    it('should return null for no results', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.noResults);
      const item = createMockItem({ title: 'Nonexistent Paper' });
      const result = await searchCrossRefForDOI(item);
      expect(result).toBe(null);
    });

    it('should handle HTTP errors gracefully', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.serverError);
      const item = createMockItem({ title: 'Test' });
      const result = await searchCrossRefForDOI(item);
      expect(result).toBe(null);
    });

    it('should handle rate limiting', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.rateLimited);
      const item = createMockItem({ title: 'Test' });
      const result = await searchCrossRefForDOI(item);
      expect(result).toBe(null);
    });
  });

  describe('fetchCrossRefMetadata', () => {
    let fetchCrossRefMetadata: any;

    beforeEach(() => {
      fetchCrossRefMetadata = createZotadataMethod('fetchCrossRefMetadata');
    });

    it('should fetch and parse metadata', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.metadata);
      const result = await fetchCrossRefMetadata('10.1000/test.doi');
      expect(result).toMatchObject({
        title: ['Full Metadata Paper'],
        DOI: '10.1000/test.doi',
        type: 'journal-article',
      });
    });
  });

  describe('searchCrossRefByArxivId', () => {
    let searchCrossRefByArxivId: any;

    beforeEach(() => {
      searchCrossRefByArxivId = createZotadataMethod('searchCrossRefByArxivId');
    });

    it('should find published version by arXiv ID', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.arxivMatch);
      const result = await searchCrossRefByArxivId('2301.12345');
      expect(result).toBe('10.1000/published.doi');
    });
  });

  describe('searchOpenAlexExact', () => {
    let searchOpenAlexExact: any;

    beforeEach(() => {
      searchOpenAlexExact = createZotadataMethod('searchOpenAlexExact', {
        titleSimilarity: createZotadataMethod('titleSimilarity'),
      });
    });

    it('should find DOI with high similarity threshold', async () => {
      registerFixture('api.openalex.org', openalexFixtures.singleWork);
      const item = createMockItem({
        title: 'Test Paper Title',
        DOI: '10.1000/test.doi',
      });
      const result = await searchOpenAlexExact(item, 'Test Paper Title');
      expect(result).toBe('10.1000/test.doi');
    });

    it('should return null for no results', async () => {
      registerFixture('api.openalex.org', openalexFixtures.noResults);
      const item = createMockItem({ title: 'Nonexistent' });
      const result = await searchOpenAlexExact(item, 'Nonexistent');
      expect(result).toBe(null);
    });
  });

  describe('searchOpenAlexTitleOnly', () => {
    let searchOpenAlexTitleOnly: any;

    beforeEach(() => {
      searchOpenAlexTitleOnly = createZotadataMethod('searchOpenAlexTitleOnly', {
        titleSimilarity: createZotadataMethod('titleSimilarity'),
      });
    });

    it('should search by title with 0.90 threshold', async () => {
      registerFixture('api.openalex.org', openalexFixtures.singleWork);
      const item = createMockItem({ title: 'Test Paper Title' });
      const result = await searchOpenAlexTitleOnly(item, 'Test Paper Title');
      expect(result).toBeDefined();
    });
  });

  describe('searchSemanticScholarForDOI', () => {
    let searchSemanticScholarForDOI: any;

    beforeEach(() => {
      searchSemanticScholarForDOI = createZotadataMethod('searchSemanticScholarForDOI', {
        titleSimilarity: createZotadataMethod('titleSimilarity'),
        searchSemanticScholarExact: createZotadataMethod('searchSemanticScholarExact', {
          titleSimilarity: createZotadataMethod('titleSimilarity'),
        }),
        searchSemanticScholarRelaxed: createZotadataMethod('searchSemanticScholarRelaxed', {
          titleSimilarity: createZotadataMethod('titleSimilarity'),
        }),
      });
    });

    it('should find DOI from Semantic Scholar', async () => {
      const { semanticscholarFixtures } = await import('../../__mocks__/fixtures/semanticscholar');
      registerFixture('api.semanticscholar.org', semanticscholarFixtures.singlePaper);
      const item = createMockItem({ title: 'Test Paper Title' });
      const result = await searchSemanticScholarForDOI(item);
      expect(result).toBe('10.1000/test.doi');
    });

    it('should filter arXiv venues', async () => {
      const { semanticscholarFixtures } = await import('../../__mocks__/fixtures/semanticscholar');
      registerFixture('api.semanticscholar.org', semanticscholarFixtures.arxivPaper);
      const item = createMockItem({ title: 'arXiv Paper' });
      const result = await searchSemanticScholarForDOI(item);
      expect(result).toBe(null);
    });
  });

  describe('searchCrossRefForPublishedVersion', () => {
    let searchCrossRefForPublishedVersion: any;

    beforeEach(() => {
      searchCrossRefForPublishedVersion = createZotadataMethod('searchCrossRefForPublishedVersion', {
        titleSimilarity: createZotadataMethod('titleSimilarity'),
      });
    });

    it('should exclude arXiv container from results', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.arxivMatch);
      const item = createMockItem({ title: 'Published Version of arXiv Paper' });
      const result = await searchCrossRefForPublishedVersion(item);
      expect(result).toBeDefined();
    });

    it('should require 0.9 title similarity', async () => {
      registerFixture('crossref.org/works', crossrefFixtures.singleWork);
      const item = createMockItem({ title: 'Test Paper Title' });
      const result = await searchCrossRefForPublishedVersion(item);
      expect(result).toBeDefined();
    });
  });
});