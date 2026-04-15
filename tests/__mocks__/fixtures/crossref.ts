// tests/__mocks__/fixtures/crossref.ts
export const crossrefFixtures = {
  singleWork: {
    status: 200,
    responseText: JSON.stringify({
      message: {
        items: [
          {
            DOI: "10.1000/test.doi",
            title: ["Test Paper Title"],
            author: [{ given: "John", family: "Smith" }],
            "published-print": { "date-parts": [[2023]] },
            type: "journal-article",
          },
        ],
      },
    }),
    getResponseHeader: () => null,
  },

  multipleWorks: {
    status: 200,
    responseText: JSON.stringify({
      message: {
        items: [
          {
            DOI: "10.1000/test1.doi",
            title: ["First Paper"],
            author: [{ given: "John", family: "Smith" }],
            type: "journal-article",
          },
          {
            DOI: "10.1000/test2.doi",
            title: ["Second Paper"],
            author: [{ given: "Jane", family: "Doe" }],
            type: "journal-article",
          },
        ],
      },
    }),
    getResponseHeader: () => null,
  },

  noResults: {
    status: 200,
    responseText: JSON.stringify({
      message: { items: [] },
    }),
    getResponseHeader: () => null,
  },

  arxivMatch: {
    status: 200,
    responseText: JSON.stringify({
      message: {
        items: [
          {
            DOI: "10.1000/published.doi",
            title: ["Published Version of arXiv Paper"],
            type: "journal-article",
          },
        ],
      },
    }),
    getResponseHeader: () => null,
  },

  metadata: {
    status: 200,
    responseText: JSON.stringify({
      message: {
        DOI: "10.1000/test.doi",
        title: ["Full Metadata Paper"],
        author: [
          { given: "John", family: "Smith" },
          { given: "Jane", family: "Doe" },
        ],
        "container-title": ["Test Journal"],
        "published-print": { "date-parts": [[2023, 5, 15]] },
        volume: "10",
        issue: "2",
        page: "123-145",
        type: "journal-article",
        URL: "https://doi.org/10.1000/test.doi",
      },
    }),
    getResponseHeader: () => null,
  },

  rateLimited: {
    status: 429,
    responseText: JSON.stringify({
      message: "Rate limit exceeded",
    }),
    getResponseHeader: () => null,
  },

  serverError: {
    status: 500,
    responseText: JSON.stringify({
      message: "Internal server error",
    }),
    getResponseHeader: () => null,
  },
};
