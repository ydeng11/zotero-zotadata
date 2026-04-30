import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { CrossRefAPI } from "@/features/metadata/apis/CrossRefAPI";
import { OpenAlexAPI } from "@/features/metadata/apis/OpenAlexAPI";

describe("MetadataFetcher - CrossRef Incorrect Match Rejection", () => {
  let fetcher: MetadataFetcher;

  beforeEach(() => {
    fetcher = new MetadataFetcher();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should reject incorrect CrossRef match and use correct OpenAlex match", async () => {
    // Create item with title only (no authors)
    const item = createMockZoteroItem({
      title: "Adversarial Machine Learning at Scale",
      itemTypeID: 1, // journalArticle
      creators: [], // No authors
    });

    // Mock CrossRef API to return an INCORRECT match
    // This is the problematic scenario: CrossRef returns a different paper with similar title
    vi.spyOn(CrossRefAPI.prototype, "search").mockResolvedValue([
      {
        title: "Large-scale strategic games and adversarial machine learning",
        authors: ["Tansu Alpcan", "Benjamin I. P. Rubinstein", "Chris Leckie"],
        year: 2012,
        doi: "10.1145/2382196.2382271",
        url: "https://dl.acm.org/doi/10.1145/2382196.2382271",
        confidence: 0.85, // High confidence but WRONG match
        source: "CrossRef",
      },
    ]);

    // Mock OpenAlex API to return the CORRECT match
    vi.spyOn(OpenAlexAPI.prototype, "search").mockResolvedValue([
      {
        title: "Adversarial Machine Learning at Scale",
        authors: ["Alexey Kurakin", "Ian Goodfellow", "Samy Bengio"],
        year: 2016,
        doi: "10.48550/arxiv.1611.01236",
        url: "https://arxiv.org/abs/1611.01236",
        confidence: 0.95,
        source: "OpenAlex",
      },
    ]);

    const result = await fetcher.fetchMetadataForItem(item, {
      strategy: "parallel",
    });

    // Verify the fetch was successful
    expect(result.success).toBe(true);

    // Verify that the correct authors were set (from OpenAlex, not CrossRef)
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

    // Verify that the correct DOI was set
    expect(item.setField).toHaveBeenCalledWith(
      "DOI",
      "10.48550/arxiv.1611.01236",
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
