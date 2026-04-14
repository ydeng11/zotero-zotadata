import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { CrossRefAPI } from "@/features/metadata/apis/CrossRefAPI";
import { OpenAlexAPI } from "@/features/metadata/apis/OpenAlexAPI";
import { SemanticScholarAPI } from "@/features/metadata/apis/SemanticScholarAPI";

describe("MetadataFetcher - No Authors Case", () => {
  let fetcher: MetadataFetcher;

  beforeEach(() => {
    fetcher = new MetadataFetcher();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should add authors when item has no creators initially", async () => {
    // Create item with title only (no authors)
    const item = createMockZoteroItem({
      title: "Adversarial Machine Learning at Scale",
      itemTypeID: 1, // journalArticle
      creators: [], // No authors
    });

    // Mock DOI lookup via title search to return the correct paper
    vi.spyOn(CrossRefAPI.prototype, "search").mockResolvedValue([
      {
        title: "Adversarial Machine Learning at Scale",
        authors: ["Alexey Kurakin", "Ian Goodfellow", "Samy Bengio"],
        year: 2016,
        doi: "10.48550/arxiv.1611.01236",
        url: "https://arxiv.org/abs/1611.01236",
        confidence: 0.95,
        source: "CrossRef",
      },
    ]);

    vi.spyOn(OpenAlexAPI.prototype, "searchExact").mockResolvedValue([]);
    vi.spyOn(OpenAlexAPI.prototype, "search").mockResolvedValue([
      {
        title: "Adversarial Machine Learning at Scale",
        authors: ["Alexey Kurakin", "Ian J. Goodfellow", "Samy Bengio"],
        year: 2016,
        doi: "10.48550/arxiv.1611.01236",
        url: "https://arxiv.org/abs/1611.01236",
        confidence: 0.98,
        source: "OpenAlex",
      },
    ]);

    vi.spyOn(
      SemanticScholarAPI.prototype,
      "searchPapersWithExternalIds",
    ).mockResolvedValue([
      {
        paperId: "adversarial-ml-scale-2016",
        title: "Adversarial Machine Learning at Scale",
        authors: [
          { name: "Alexey Kurakin" },
          { name: "Ian Goodfellow" },
          { name: "Samy Bengio" },
        ],
        year: 2016,
        doi: "10.48550/arxiv.1611.01236",
        externalIds: { DOI: "10.48550/arxiv.1611.01236", ArXiv: "1611.01236" },
        url: "https://arxiv.org/abs/1611.01236",
      },
    ]);

    const result = await fetcher.fetchMetadataForItem(item);

    // Verify the fetch was successful
    expect(result.success).toBe(true);

    // Verify authors were added (setCreators should be called)
    expect(item.setCreators).toHaveBeenCalled();

    // Get the actual creators that were set
    const callArgs = item.setCreators.mock.calls[0][0];
    expect(callArgs).toHaveLength(3);
    expect(callArgs[0]).toMatchObject({
      creatorType: "author",
      firstName: "Alexey",
      lastName: "Kurakin",
    });
    expect(callArgs[1]).toMatchObject({
      creatorType: "author",
      firstName: "Ian",
      lastName: "Goodfellow",
    });
    expect(callArgs[2]).toMatchObject({
      creatorType: "author",
      firstName: "Samy",
      lastName: "Bengio",
    });
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
