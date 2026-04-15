import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { CrossRefAPI } from "@/features/metadata/apis/CrossRefAPI";
import { OpenAlexAPI } from "@/features/metadata/apis/OpenAlexAPI";
import { SemanticScholarAPI } from "@/features/metadata/apis/SemanticScholarAPI";

describe("MetadataFetcher with Partial Information Test", () => {
  let fetcher: MetadataFetcher;

  beforeEach(() => {
    fetcher = new MetadataFetcher();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches correct metadata when given title + wrong DOI + arXiv ID", async () => {
    // Create item with the exact information provided
    const item = createMockZoteroItem({
      title: "Semi-Supervised Learning with Deep Generative Models",
      DOI: "10.29228/joh.67701", // Wrong DOI
      url: "https://johschool.com/?mod=tammetin&makaleadi=&key=67701",
      extra: "arXiv: 1406.5298",
      itemTypeID: 1, // journalArticle
      creators: [
        { firstName: "Diederik P.", lastName: "Kingma", creatorType: "author" },
        { firstName: "Shakir", lastName: "Mohamed", creatorType: "author" },
      ],
    });

    // Mock HTTP request to return CrossRef results
    vi.spyOn(globalThis.Zotero.HTTP, "request").mockResolvedValue({
      status: 200,
      responseText: JSON.stringify({
        message: {
          items: [
            {
              DOI: "10.48550/arxiv.1406.5298",
              title: ["Semi-Supervised Learning with Deep Generative Models"],
              author: [
                { given: "Diederik P.", family: "Kingma" },
                { given: "Danilo J.", family: "Rezende" },
                { given: "Shakir", family: "Mohamed" },
                { given: "Max", family: "Welling" },
              ],
              published: { "date-parts": [[2014]] },
              URL: "https://arxiv.org/abs/1406.5298",
            },
          ],
        },
      }),
      response: "{}",
      getResponseHeader: () => null,
    });

    const result = await fetcher.fetchMetadataForItem(item);

    expect(result.success).toBe(true);

    // Should have updated with correct DOI
    expect(item.setField).toHaveBeenCalledWith(
      "DOI",
      "10.48550/arxiv.1406.5298",
    );
  });

  it("fetches correct metadata when given only title + arXiv ID (no DOI)", async () => {
    const item = createMockZoteroItem({
      title: "Semi-Supervised Learning with Deep Generative Models",
      extra: "arXiv: 1406.5298",
      itemTypeID: 1,
      creators: [
        { firstName: "Diederik P.", lastName: "Kingma", creatorType: "author" },
        { firstName: "Shakir", lastName: "Mohamed", creatorType: "author" },
      ],
    });

    // Mock APIs to find correct paper
    vi.spyOn(CrossRefAPI.prototype, "fetchWorksByQuery").mockResolvedValue([
      {
        DOI: "10.48550/arxiv.1406.5298",
        title: ["Semi-Supervised Learning with Deep Generative Models"],
        author: [
          { given: "Diederik P.", family: "Kingma" },
          { given: "Danilo J.", family: "Rezende" },
          { given: "Shakir", family: "Mohamed" },
          { given: "Max", family: "Welling" },
        ],
        URL: "https://arxiv.org/abs/1406.5298",
        published: { "date-parts": [[2014]] },
      },
    ]);

    vi.spyOn(OpenAlexAPI.prototype, "searchExact").mockResolvedValue([]);
    vi.spyOn(OpenAlexAPI.prototype, "search").mockResolvedValue([
      {
        title: "Semi-Supervised Learning with Deep Generative Models",
        authors: [
          "Diederik P. Kingma",
          "Danilo J. Rezende",
          "Shakir Mohamed",
          "Max Welling",
        ],
        year: 2014,
        doi: "10.48550/arxiv.1406.5298",
        url: "https://arxiv.org/abs/1406.5298",
        confidence: 0.98,
        source: "OpenAlex",
      },
    ]);

    vi.spyOn(OpenAlexAPI.prototype, "search").mockResolvedValue([
      {
        title: "Semi-Supervised Learning with Deep Generative Models",
        authors: [
          "Diederik P. Kingma",
          "Danilo J. Rezende",
          "Shakir Mohamed",
          "Max Welling",
        ],
        year: 2014,
        doi: "10.48550/arxiv.1406.5298",
        url: "https://arxiv.org/abs/1406.5298",
        confidence: 0.98,
        source: "OpenAlex",
      },
    ]);

    const result = await fetcher.fetchMetadataForItem(item);
    expect(result.success).toBe(true);
    expect(item.setField).toHaveBeenCalledWith(
      "DOI",
      "10.48550/arxiv.1406.5298",
    );
  });

  it("fetches correct metadata when given only wrong DOI + arXiv ID", async () => {
    const item = createMockZoteroItem({
      title: "Semi-Supervised Learning with Deep Generative Models", // Add title
      DOI: "10.29228/joh.67701",
      extra: "arXiv: 1406.5298",
      itemTypeID: 1,
      creators: [
        { firstName: "Diederik P.", lastName: "Kingma", creatorType: "author" },
        { firstName: "Shakir", lastName: "Mohamed", creatorType: "author" },
      ],
    });

    // Mock HTTP request to return CrossRef results
    vi.spyOn(globalThis.Zotero.HTTP, "request").mockResolvedValue({
      status: 200,
      responseText: JSON.stringify({
        message: {
          items: [
            {
              DOI: "10.48550/arxiv.1406.5298",
              title: ["Semi-Supervised Learning with Deep Generative Models"],
              author: [
                { given: "Diederik P.", family: "Kingma" },
                { given: "Danilo J.", family: "Rezende" },
                { given: "Shakir", family: "Mohamed" },
                { given: "Max", family: "Welling" },
              ],
              URL: "https://arxiv.org/abs/1406.5298",
              published: { "date-parts": [[2014]] },
            },
          ],
        },
      }),
      response: "{}",
      getResponseHeader: () => null,
    });

    const result = await fetcher.fetchMetadataForItem(item);
    expect(result.success).toBe(true);

    // Should have updated with correct DOI
    expect(item.setField).toHaveBeenCalledWith(
      "DOI",
      "10.48550/arxiv.1406.5298",
    );
  });
});

function createMockZoteroItem(fields: any): any {
  const data = { ...fields };
  return {
    id: Math.floor(Math.random() * 10000),
    itemTypeID: data.itemTypeID || 1,
    getField: (field: string) => data[field],
    setField: vi.fn((field: string, value: any) => {
      data[field] = value;
    }),
    getCreators: () => data.creators || [],
    setCreators: vi.fn(),
    addTag: vi.fn(),
    saveTx: vi.fn(),
    isRegularItem: () => true,
  };
}
