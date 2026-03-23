// tests/__mocks__/fixtures/unpaywall.ts
export const unpaywallFixtures = {
  openAccessPDF: {
    status: 200,
    responseText: JSON.stringify({
      is_oa: true,
      best_oa_location: {
        url_for_pdf: 'https://example.com/paper.pdf',
        host_type: 'publisher',
      },
    }),
    getResponseHeader: () => null,
  },

  noOpenAccess: {
    status: 200,
    responseText: JSON.stringify({
      is_oa: false,
      best_oa_location: null,
    }),
    getResponseHeader: () => null,
  },

  noPDFURL: {
    status: 200,
    responseText: JSON.stringify({
      is_oa: true,
      best_oa_location: {
        url_for_pdf: null,
        host_type: 'repository',
      },
    }),
    getResponseHeader: () => null,
  },

  notFound: {
    status: 404,
    responseText: JSON.stringify({
      error: 'Not found',
    }),
    getResponseHeader: () => null,
  },

  serverError: {
    status: 500,
    responseText: JSON.stringify({
      error: 'Internal server error',
    }),
    getResponseHeader: () => null,
  },
};