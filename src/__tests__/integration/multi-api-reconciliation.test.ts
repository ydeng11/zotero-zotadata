import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { CrossRefAPI } from "@/features/metadata/apis/CrossRefAPI";
import { OpenAlexAPI } from "@/features/metadata/apis/OpenAlexAPI";
import { SemanticScholarAPI } from "@/features/metadata/apis/SemanticScholarAPI";

describe("MetadataFetcher - Multi-API Reconciliation", () => {
  let fetcher: MetadataFetcher;

  beforeEach(() => {
    fetcher = new MetadataFetcher();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should prioritize exact title match from OpenAlex over partial CrossRef match", async () => {
    const item = createMockZoteroItem({
      title: "Adversarial Machine Learning at Scale",
      itemTypeID: 1,
      creators: [],
    });

    // CrossRef returns wrong paper with similar title
    vi.spyOn(CrossRefAPI.prototype, "search").mockResolvedValue([
      {
        title: "Large-scale strategic games and adversarial machine learning",
        authors: [
          "Tansu Alpcan",
          "Benjamin I. P. Rubinstein",
          "Christopher Leckie",
        ],
        year: 2016,
        doi: "10.1109/cdc.2016.7798940",
        confidence: 0.85,
        source: "CrossRef",
      },
    ]);

    // OpenAlex returns correct paper with exact title match
    vi.spyOn(OpenAlexAPI.prototype, "search").mockResolvedValue([
      {
        title: "Adversarial Machine Learning at Scale",
        authors: ["Alexey Kurakin", "Ian Goodfellow", "Samy Bengio"],
        year: 2016,
        doi: "10.48550/arxiv.1611.01236",
        confidence: 0.95,
        source: "OpenAlex",
      },
    ]);

    // Semantic Scholar might be rate limited or return nothing
    vi.spyOn(SemanticScholarAPI.prototype, "search").mockResolvedValue([]);

    const result = await fetcher.fetchMetadataForItem(item, {
      strategy: "parallel",
    });

    expect(result.success).toBe(true);
    expect(item.setField).toHaveBeenCalledWith(
      "DOI",
      "10.48550/arxiv.1611.01236",
    );

    const setCreators = item.setCreators as ReturnType<typeof vi.fn>;
    const callArgs = setCreators.mock.calls[0][0] as ReturnType<
      Zotero.Item["getCreators"]
    >;
    expect(callArgs[0].firstName).toBe("Alexey");
    expect(callArgs[0].lastName).toBe("Kurakin");
  });
});

function createMockZoteroItem(fields: Record<string, unknown>): Zotero.Item {
  const data: Record<string, unknown> = { ...fields };
  return {
    id: Math.floor(Math.random() * 10000),
    itemTypeID: Number(data.itemTypeID ?? 1),
    getField: (field: string) => String(data[field] ?? ""),
    setField: vi.fn((field: string, value: string) => {
      data[field] = value;
    }),
    getCreators: () =>
      Array.isArray(data.creators)
        ? (data.creators as ReturnType<Zotero.Item["getCreators"]>)
        : [],
    setCreators: vi.fn(),
    addTag: vi.fn(),
    saveTx: vi.fn(),
    isRegularItem: () => true,
  } as unknown as Zotero.Item;
}
