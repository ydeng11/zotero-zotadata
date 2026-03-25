// tests/__mocks__/fixtures/arxiv.ts
export const arxivFixtures = {
  singleEntry: {
    status: 200,
    responseText: `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <entry>
    <id>http://arxiv.org/abs/2301.12345</id>
    <title>Test arXiv Paper</title>
    <author><name>John Smith</name></author>
    <summary>Abstract text</summary>
    <link href="http://arxiv.org/pdf/2301.12345" rel="alternate" type="application/pdf"/>
  </entry>
</feed>`,
    getResponseHeader: () => null,
  },

  noResults: {
    status: 200,
    responseText: `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom"></feed>`,
    getResponseHeader: () => null,
  },
};