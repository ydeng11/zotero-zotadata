// tests/__mocks__/fixtures/openalex.ts
export const openalexFixtures = {
  singleWork: {
    status: 200,
    responseText: JSON.stringify({
      results: [
        {
          id: "https://openalex.org/W123456789",
          display_name: "Test Paper Title",
          title: "Test Paper Title",
          authorships: [{ author: { display_name: "John Smith" } }],
          publication_year: 2023,
          doi: "https://doi.org/10.1000/test.doi",
          open_access: { is_oa: false },
        },
      ],
      meta: { count: 1 },
    }),
    getResponseHeader: () => null,
  },

  withPdf: {
    status: 200,
    responseText: JSON.stringify({
      results: [
        {
          id: "https://openalex.org/W123456789",
          display_name: "Open Access Paper",
          title: "Open Access Paper",
          doi: "https://doi.org/10.1000/oa.doi",
          open_access: {
            is_oa: true,
            oa_url: "https://example.com/paper.pdf",
          },
        },
      ],
      meta: { count: 1 },
    }),
    getResponseHeader: () => null,
  },

  noResults: {
    status: 200,
    responseText: JSON.stringify({
      results: [],
      meta: { count: 0 },
    }),
    getResponseHeader: () => null,
  },
};
