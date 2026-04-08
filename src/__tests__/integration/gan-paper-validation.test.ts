import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { CrossRefAPI } from "@/features/metadata/apis/CrossRefAPI";
import { OpenAlexAPI } from "@/features/metadata/apis/OpenAlexAPI";

describe("GAN Paper Validation (Integration)", () => {
  let fetcher: MetadataFetcher;

  beforeEach(() => {
    fetcher = new MetadataFetcher();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("correctly rejects wrong paper with identical title", async () => {
    const item = createMockZoteroItem({
      title: "Generative Adversarial Nets",
      extra: "arXiv: 1406.2661",
      publicationTitle: "arXiv",
      date: "2014",
      itemTypeID: 1,
      creators: [
        { firstName: "Ian J.", lastName: "Goodfellow", creatorType: "author" },
        { firstName: "Jean", lastName: "Pouget-Abadie", creatorType: "author" },
        { firstName: "Mehdi", lastName: "Mirza", creatorType: "author" },
        { firstName: "Bing", lastName: "Xu", creatorType: "author" },
        { firstName: "David", lastName: "Warde-Farley", creatorType: "author" },
        { firstName: "Sherjil", lastName: "Ozair", creatorType: "author" },
        { firstName: "Aaron", lastName: "Courville", creatorType: "author" },
        { firstName: "Yoshua", lastName: "Bengio", creatorType: "author" },
      ],
    });

    vi.spyOn(CrossRefAPI.prototype, "fetchWorksByQuery").mockResolvedValue([]);

    vi.spyOn(OpenAlexAPI.prototype, "search").mockResolvedValue([
      {
        title: "Generative Adversarial Nets",
        authors: ["Raphael Labaca-Castro"],
        year: 2023,
        doi: "10.1007/978-3-658-40442-0_9",
        confidence: 1,
        source: "OpenAlex",
      },
    ]);

    const result = await (fetcher as any).discoverDOI(item, {
      ignoreExistingDoi: true,
      publishedOnly: false,
    });

    expect(result).not.toBe("10.1007/978-3-658-40442-0_9");

    expect(result).toBe("10.48550/arxiv.1406.2661");
  });

  it("accepts correct paper when found with matching authors", async () => {
    const item = createMockZoteroItem({
      title: "Generative Adversarial Nets",
      extra: "arXiv: 1406.2661",
      publicationTitle: "arXiv",
      date: "2014",
      itemTypeID: 1,
      creators: [
        { firstName: "Ian J.", lastName: "Goodfellow", creatorType: "author" },
        { firstName: "Yoshua", lastName: "Bengio", creatorType: "author" },
      ],
    });

    vi.spyOn(CrossRefAPI.prototype, "fetchWorksByQuery").mockResolvedValue([
      {
        DOI: "10.5555/2969033.2969125",
        title: ["Generative Adversarial Nets"],
        author: [
          { given: "Ian", family: "Goodfellow" },
          { given: "Yoshua", family: "Bengio" },
        ],
        published: { "date-parts": [[2014]] },
      },
    ]);

    vi.spyOn(OpenAlexAPI.prototype, "search").mockResolvedValue([]);

    const result = await (fetcher as any).discoverDOI(item, {
      ignoreExistingDoi: true,
      publishedOnly: false,
    });

    expect(result).toBe("10.5555/2969033.2969125");
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
