import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { CrossRefAPI } from "@/features/metadata/apis/CrossRefAPI";
import { OpenAlexAPI } from "@/features/metadata/apis/OpenAlexAPI";

describe("MetadataFetcher - Quantum ML Wrong Match Prevention", () => {
  let fetcher: MetadataFetcher;

  beforeEach(() => {
    fetcher = new MetadataFetcher();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should reject 'Benchmarking adversarially robust quantum machine learning at scale' and use correct 'Adversarial Machine Learning at Scale'", async () => {
    // Create item with correct title only
    const item = createMockZoteroItem({
      title: "Adversarial Machine Learning at Scale",
      itemTypeID: 1,
      creators: [],
    });

    // Mock CrossRef returning WRONG quantum ML paper
    vi.spyOn(CrossRefAPI.prototype, "search").mockResolvedValue([
      {
        title:
          "Benchmarking adversarially robust quantum machine learning at scale",
        authors: ["Maria Schuld", "Francesco Petruccione"],
        year: 2023,
        doi: "10.48550/arxiv.2305.15424",
        confidence: 0.9, // High confidence but WRONG match
        source: "CrossRef",
      },
    ]);

    // Mock OpenAlex returning CORRECT paper
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

    const result = await fetcher.fetchMetadataForItem(item, {
      strategy: "parallel",
    });

    expect(result.success).toBe(true);

    // Should use OpenAlex result, not CrossRef quantum ML result
    expect(item.setField).toHaveBeenCalledWith(
      "DOI",
      "10.48550/arxiv.1611.01236",
    );

    const callArgs = item.setCreators.mock.calls[0][0];
    expect(callArgs[0].firstName).toBe("Alexey");
    expect(callArgs[0].lastName).toBe("Kurakin");
    expect(callArgs[1].firstName).toBe("Ian");
    expect(callArgs[1].lastName).toBe("Goodfellow");
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
