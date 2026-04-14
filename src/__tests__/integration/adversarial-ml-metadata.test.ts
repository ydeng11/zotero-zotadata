import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { CrossRefAPI } from "@/features/metadata/apis/CrossRefAPI";
import { OpenAlexAPI } from "@/features/metadata/apis/OpenAlexAPI";
import { SemanticScholarAPI } from "@/features/metadata/apis/SemanticScholarAPI";

describe("MetadataFetcher - Adversarial Machine Learning at Scale Test", () => {
  let fetcher: MetadataFetcher;

  beforeEach(() => {
    fetcher = new MetadataFetcher();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches correct metadata for 'Adversarial Machine Learning at Scale' with DOI-first workflow and adds no tags", async () => {
    // Create item with title only (no DOI initially)
    const item = createMockZoteroItem({
      title: "Adversarial Machine Learning at Scale",
      itemTypeID: 1, // journalArticle
      creators: [
        { firstName: "Alexey", lastName: "Kurakin", creatorType: "author" },
        { firstName: "Ian", lastName: "Goodfellow", creatorType: "author" },
        { firstName: "Samy", lastName: "Bengio", creatorType: "author" },
      ],
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

    vi.spyOn(SemanticScholarAPI.prototype, "searchByArxivId").mockResolvedValue(
      [
        {
          title: "Adversarial Machine Learning at Scale",
          authors: ["Alexey Kurakin", "Ian Goodfellow", "Samy Bengio"],
          year: 2016,
          doi: "10.48550/arxiv.1611.01236",
          url: "https://arxiv.org/abs/1611.01236",
          confidence: 0.97,
          source: "SemanticScholar",
        },
      ],
    );

    const result = await fetcher.fetchMetadataForItem(item);

    // Verify the fetch was successful
    expect(result.success).toBe(true);

    // Verify the correct DOI was added (normalized to lowercase)
    expect(item.setField).toHaveBeenCalledWith(
      "DOI",
      "10.48550/arxiv.1611.01236",
    );

    // Verify the title was preserved (though it's the same)
    expect(item.setField).toHaveBeenCalledWith(
      "title",
      "Adversarial Machine Learning at Scale",
    );

    // Verify the year was set correctly
    expect(item.setField).toHaveBeenCalledWith("date", "2016");

    // Verify authors were updated correctly
    expect(item.setCreators).toHaveBeenCalled();

    // CRITICAL: Verify NO tags were added during the metadata fetching process
    expect(item.addTag).not.toHaveBeenCalled();
  });

  it("fetches correct metadata when given existing arXiv ID and verifies no tags added", async () => {
    // Create item with title and arXiv ID in extra field
    const item = createMockZoteroItem({
      title: "Adversarial Machine Learning at Scale",
      extra: "arXiv: 1611.01236",
      itemTypeID: 1, // journalArticle
      creators: [
        { firstName: "Alexey", lastName: "Kurakin", creatorType: "author" },
      ],
    });

    // Mock APIs to find correct paper via arXiv ID
    vi.spyOn(CrossRefAPI.prototype, "fetchWorksByArxivId").mockResolvedValue([
      {
        DOI: "10.48550/arXiv.1611.01236",
        title: ["Adversarial Machine Learning at Scale"],
        author: [
          { given: "Alexey", family: "Kurakin" },
          { given: "Ian", family: "Goodfellow" },
          { given: "Samy", family: "Bengio" },
        ],
        URL: "https://arxiv.org/abs/1611.01236",
        published: { "date-parts": [[2016]] },
      },
    ]);

    // Mock general search as fallback
    vi.spyOn(OpenAlexAPI.prototype, "search").mockResolvedValue([
      {
        title: "Adversarial Machine Learning at Scale",
        authors: ["Alexey Kurakin", "Ian Goodfellow", "Samy Bengio"],
        year: 2016,
        doi: "10.48550/arxiv.1611.01236",
        url: "https://arxiv.org/abs/1611.01236",
        confidence: 0.99,
        source: "OpenAlex",
      },
    ]);

    const result = await fetcher.fetchMetadataForItem(item);
    expect(result.success).toBe(true);

    // Verify the correct DOI was added (normalized to lowercase)
    expect(item.setField).toHaveBeenCalledWith(
      "DOI",
      "10.48550/arxiv.1611.01236",
    );

    // Verify complete author list was added
    expect(item.setCreators).toHaveBeenCalled();

    // CRITICAL: Verify NO tags were added
    expect(item.addTag).not.toHaveBeenCalled();
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
