import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { CrossRefAPI } from "@/features/metadata/apis/CrossRefAPI";
import { OpenAlexAPI } from "@/features/metadata/apis/OpenAlexAPI";

describe("MetadataFetcher No DOI Found Test", () => {
  let fetcher: MetadataFetcher;

  beforeEach(() => {
    fetcher = new MetadataFetcher();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should fall back to general search when no DOI found but arXiv ID exists", async () => {
    // This reproduces the exact scenario: journalArticle with title + arXiv ID in Extra, no DOI
    const item = createMockZoteroItem({
      title: "Semi-Supervised Learning with Deep Generative Models",
      extra: "arXiv: 1406.5298",
      itemTypeID: 1, // journalArticle - this triggers the legacy DOI path
      creators: [
        { firstName: "Diederik P.", lastName: "Kingma", creatorType: "author" },
        { firstName: "Shakir", lastName: "Mohamed", creatorType: "author" },
      ],
    });

    // Mock the legacy DOI path to fail (no DOI found)
    // But also mock the general search to succeed

    // First, the legacy path will be called and should return null or fail
    // Then the general search should be called

    // Mock general search APIs
    vi.spyOn(CrossRefAPI.prototype, "search").mockResolvedValue([
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
        source: "CrossRef",
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

    const result = await fetcher.fetchMetadataForItem(item);

    // This should succeed because it falls back to general search
    expect(result.success).toBe(true);
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
