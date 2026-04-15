// tests/__mocks__/fixtures/core.ts
export const coreFixtures = {
  pdfFound: {
    status: 200,
    responseText: JSON.stringify({
      results: [
        {
          id: "12345",
          title: "Test Paper",
          downloadUrl: "https://core.ac.uk/download/pdf/12345.pdf",
          doi: "10.1000/test.doi",
        },
      ],
    }),
    getResponseHeader: () => null,
  },

  multipleResults: {
    status: 200,
    responseText: JSON.stringify({
      results: [
        {
          id: "11111",
          title: "First Paper",
          downloadUrl: null,
          doi: "10.1000/test1.doi",
        },
        {
          id: "22222",
          title: "Second Paper",
          downloadUrl: "https://core.ac.uk/download/pdf/22222.pdf",
          doi: "10.1000/test2.doi",
        },
      ],
    }),
    getResponseHeader: () => null,
  },

  noResults: {
    status: 200,
    responseText: JSON.stringify({
      results: [],
    }),
    getResponseHeader: () => null,
  },

  noDownloadUrl: {
    status: 200,
    responseText: JSON.stringify({
      results: [
        {
          id: "12345",
          title: "Test Paper",
          downloadUrl: null,
          doi: "10.1000/test.doi",
        },
      ],
    }),
    getResponseHeader: () => null,
  },

  nonPdfUrl: {
    status: 200,
    responseText: JSON.stringify({
      results: [
        {
          id: "12345",
          title: "Test Paper",
          downloadUrl: "https://example.com/page.html",
          doi: "10.1000/test.doi",
        },
      ],
    }),
    getResponseHeader: () => null,
  },

  serverError: {
    status: 500,
    responseText: JSON.stringify({
      error: "Internal server error",
    }),
    getResponseHeader: () => null,
  },
};
