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

    // Mock DOI lookup to return the wrong paper
    vi.spyOn(CrossRefAPI.prototype, "getWorkByDOI").mockResolvedValue({
      title: "Semi-Supervised Learning with Deep Generative Models",
      authors: ["Abdulselami Sarigül", "Shakir Mohamed"],
      year: 2023,
      doi: "10.29228/joh.67701",
      url: "https://johschool.com/?mod=tammetin&makaleadi=&key=67701",
      confidence: 0.6,
      source: "CrossRef",
    });

    // Mock general search to find the correct paper via arXiv ID
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

    vi.spyOn(
      SemanticScholarAPI.prototype,
      "searchPapersWithExternalIds",
    ).mockResolvedValue([
      {
        paperId: "123456",
        title: "Semi-Supervised Learning with Deep Generative Models",
        authors: [
          { name: "Diederik P. Kingma" },
          { name: "Danilo J. Rezende" },
          { name: "Shakir Mohamed" },
          { name: "Max Welling" },
        ],
        year: 2014,
        doi: "10.48550/arxiv.1406.5298",
        externalIds: { DOI: "10.48550/arxiv.1406.5298", ArXiv: "1406.5298" },
        url: "https://arxiv.org/abs/1406.5298",
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

    vi.spyOn(SemanticScholarAPI.prototype, "searchByArxivId").mockResolvedValue(
      [
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
          confidence: 0.97,
          source: "SemanticScholar",
        },
      ],
    );

    const result = await fetcher.fetchMetadataForItem(item);

    expect(result.success).toBe(true);

    // Should have updated with correct DOI, not the wrong one
    expect(item.setField).toHaveBeenCalledWith(
      "DOI",
      "10.48550/arxiv.1406.5298",
    );

    // Should have updated title (though it's the same)
    expect(item.setField).toHaveBeenCalledWith(
      "title",
      "Semi-Supervised Learning with Deep Generative Models",
    );

    // Should have updated year to 2014, not 2023
    expect(item.setField).toHaveBeenCalledWith("date", "2014");

    // Should NOT have kept the wrong DOI
    expect(item.setField).not.toHaveBeenCalledWith("DOI", "10.29228/joh.67701");
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
      DOI: "10.29228/joh.67701",
      extra: "arXiv: 1406.5298",
      itemTypeID: 1,
      creators: [
        { firstName: "Diederik P.", lastName: "Kingma", creatorType: "author" },
        { firstName: "Shakir", lastName: "Mohamed", creatorType: "author" },
      ],
    });

    // Mock DOI lookup to return wrong paper
    vi.spyOn(CrossRefAPI.prototype, "fetchWorksByQuery").mockResolvedValue([
      {
        DOI: "10.29228/joh.67701",
        title: ["Semi-Supervised Learning with Deep Generative Models"],
        author: [
          { given: "Abdulselami", family: "Sarigül" },
          { given: "Shakir", family: "Mohamed" },
        ],
        published: { "date-parts": [[2023]] },
      },
    ]);

    // Mock arXiv search to find correct paper
    vi.spyOn(CrossRefAPI.prototype, "fetchWorksByArxivId").mockResolvedValue([
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

    const result = await fetcher.fetchMetadataForItem(item);
    expect(result.success).toBe(true);

    // Should prioritize arXiv-based search over wrong DOI
    expect(item.setField).toHaveBeenCalledWith(
      "DOI",
      "10.48550/arxiv.1406.5298",
    );

    // Should update title even if not initially present
    expect(item.setField).toHaveBeenCalledWith(
      "title",
      "Semi-Supervised Learning with Deep Generative Models",
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
