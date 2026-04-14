import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { CrossRefAPI } from "@/features/metadata/apis/CrossRefAPI";
import { OpenAlexAPI } from "@/features/metadata/apis/OpenAlexAPI";

describe("Semi-Supervised Learning Paper Integration Test", () => {
  let fetcher: MetadataFetcher;

  beforeEach(() => {
    fetcher = new MetadataFetcher();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("correctly fetches metadata for Semi-Supervised Learning paper using title and arXiv ID", async () => {
    const item = createMockZoteroItem({
      title: "Semi-Supervised Learning with Deep Generative Models",
      extra: "arXiv: 1406.5298",
      publicationTitle: "arXiv",
      date: "2014",
      itemTypeID: 1,
      creators: [
        { firstName: "Diederik P.", lastName: "Kingma", creatorType: "author" },
        { firstName: "Shakir", lastName: "Mohamed", creatorType: "author" },
      ],
    });

    // Mock CrossRef to return the correct Kingma et al. 2014 paper
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

    // Mock OpenAlex to also return the correct paper
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
        confidence: 0.95,
        source: "OpenAlex",
      },
    ]);

    // Mock OpenAlex to also return the correct paper
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
        confidence: 0.95,
        source: "OpenAlex",
      },
    ]);

    const result = await fetcher.fetchMetadataForItem(item);

    expect(result.success).toBe(true);

    // Verify it got the correct DOI
    expect(item.setField).toHaveBeenCalledWith(
      "DOI",
      "10.48550/arxiv.1406.5298",
    );
  });

  it("rejects wrong Journal of Hygiene paper when fetching with arXiv ID", async () => {
    const item = createMockZoteroItem({
      title: "Semi-Supervised Learning with Deep Generative Models",
      extra: "arXiv: 1406.5298",
      publicationTitle: "arXiv",
      date: "2014",
      itemTypeID: 1,
      creators: [
        { firstName: "Diederik P.", lastName: "Kingma", creatorType: "author" },
      ],
    });

    // Mock APIs to return both papers, but ensure validation rejects the wrong one
    vi.spyOn(CrossRefAPI.prototype, "fetchWorksByQuery").mockResolvedValue([
      {
        DOI: "10.29228/joh.67701",
        title: ["Semi-Supervised Learning with Deep Generative Models"],
        author: [
          { given: "Abdulselami", family: "Sarigül" },
          { given: "Shakir", family: "Mohamed" },
        ],
        URL: "https://johschool.com/?mod=tammetin&makaleadi=&key=67701",
        published: { "date-parts": [[2023]] },
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
        confidence: 0.95,
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
        confidence: 0.95,
        source: "OpenAlex",
      },
    ]);

    const result = await fetcher.fetchMetadataForItem(item);

    expect(result.success).toBe(true);

    // Should get the OpenAlex result (higher confidence) not the CrossRef wrong paper
    expect(item.setField).toHaveBeenCalledWith(
      "DOI",
      "10.48550/arxiv.1406.5298",
    );

    // Should NOT have the wrong Journal of Hygiene DOI
    expect(item.setField).not.toHaveBeenCalledWith("DOI", "10.29228/joh.67701");
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
  };
}
