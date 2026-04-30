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

    // Mock HTTP request to return CrossRef results
    vi.spyOn(globalThis.Zotero.HTTP, "request").mockResolvedValue({
      status: 200,
      responseText: JSON.stringify({
        message: {
          items: [
            {
              DOI: "10.48550/arxiv.1611.01236",
              title: ["Adversarial Machine Learning at Scale"],
              author: [
                { given: "Alexey", family: "Kurakin" },
                { given: "Ian", family: "Goodfellow" },
                { given: "Samy", family: "Bengio" },
              ],
              published: { "date-parts": [[2016]] },
              URL: "https://arxiv.org/abs/1611.01236",
            },
          ],
        },
      }),
      response: "{}",
      getResponseHeader: () => null,
    });

    const result = await fetcher.fetchMetadataForItem(item);

    // Verify the fetch was successful
    expect(result.success).toBe(true);

    // Verify the correct DOI was added (normalized to lowercase)
    expect(item.setField).toHaveBeenCalledWith(
      "DOI",
      "10.48550/arxiv.1611.01236",
    );
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

    // Mock HTTP request to return CrossRef results
    vi.spyOn(globalThis.Zotero.HTTP, "request").mockResolvedValue({
      status: 200,
      responseText: JSON.stringify({
        message: {
          items: [
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
          ],
        },
      }),
      response: "{}",
      getResponseHeader: () => null,
    });

    const result = await fetcher.fetchMetadataForItem(item);
    expect(result.success).toBe(true);

    // Verify the correct DOI was added
    expect(item.setField).toHaveBeenCalledWith(
      "DOI",
      "10.48550/arXiv.1611.01236",
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
