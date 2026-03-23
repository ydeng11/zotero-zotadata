// tests/__mocks__/fixtures/semanticscholar.ts
export const semanticscholarFixtures = {
  singlePaper: {
    status: 200,
    responseText: JSON.stringify({
      data: [{
        paperId: 'abc123',
        title: 'Test Paper Title',
        year: 2023,
        venue: 'Test Conference',
        externalIds: { DOI: '10.1000/test.doi' },
        authors: [{ name: 'John Smith' }],
      }],
    }),
    getResponseHeader: () => null,
  },

  arxivPaper: {
    status: 200,
    responseText: JSON.stringify({
      data: [{
        paperId: 'arxiv123',
        title: 'arXiv Paper',
        venue: 'arXiv',
        externalIds: { ArXiv: '2301.12345' },
        authors: [{ name: 'Jane Doe' }],
      }],
    }),
    getResponseHeader: () => null,
  },

  publishedVersion: {
    status: 200,
    responseText: JSON.stringify({
      data: [{
        paperId: 'pub123',
        title: 'Published Version',
        venue: 'Nature',
        year: 2024,
        externalIds: { DOI: '10.1000/published.doi' },
      }],
    }),
    getResponseHeader: () => null,
  },

  noResults: {
    status: 200,
    responseText: JSON.stringify({ data: [] }),
    getResponseHeader: () => null,
  },
};