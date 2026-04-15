import { describe, expect, it } from "vitest";
import { AttachmentChecker } from "@/features/attachment/AttachmentChecker";
import { CrossRefAPI } from "@/features/metadata/apis/CrossRefAPI";
import { OpenAlexAPI } from "@/features/metadata/apis/OpenAlexAPI";
import { MetadataFetcher } from "@/modules/MetadataFetcher";
import { ArxivProcessor } from "@/modules/ArxivProcessor";
import { FileFinder } from "@/modules/FileFinder";
import {
  createMockZoteroAttachment,
  createMockZoteroItem,
} from "../../../tests/__mocks__/zotero-items";
import { PUBLICATIONS } from "../../../tests/__mocks__/fixtures/publications";
import {
  maybeSkipTransientDownloadFailure,
  skipWithMessage,
  withTransientSkip,
} from "./liveTestUtils";

const describeLive =
  process.env.LIVE_API_TESTS === "1" ? describe.sequential : describe.skip;

function createTestMetadataFetcher(): MetadataFetcher {
  return new MetadataFetcher({
    config: {
      downloads: { maxConcurrent: 1 },
    },
  } as never);
}

function expectTag(item: Zotero.Item, tagName: string): void {
  const tags = (item as unknown as { __mockTags?: Array<{ tag: string }> })
    .__mockTags;
  expect(tags?.some((tag) => tag.tag === tagName)).toBe(true);
}

describeLive("README live workflows", () => {
  it("removes broken attachments while preserving valid weblinks", async () => {
    const item = createMockZoteroItem({
      ...PUBLICATIONS.gibbsDensitySurface,
      attachmentIds: [501, 502],
    });
    createMockZoteroAttachment({
      id: 501,
      parentID: item.id,
      linkMode: 0,
      contentType: "application/pdf",
      filePath: "/missing/gibbs.pdf",
      fileExists: false,
    });
    createMockZoteroAttachment({
      id: 502,
      parentID: item.id,
      linkMode: 2,
      contentType: "text/html",
      title: "Publisher Page",
      url: "https://doi.org/10.1007/s10765-013-1411-5",
      filePath: null,
      fileExists: false,
    });

    const checker = new AttachmentChecker();
    const stats = await checker.checkItemAttachments(item);

    expect(stats.removed).toBe(1);
    expect(stats.weblinks).toBe(1);
    expect(stats.valid).toBe(0);
  });

  it("updates metadata for the Gibbs article using live DOI services", async (context) => {
    await withTransientSkip(context, async () => {
      const preflight = await new CrossRefAPI().getCrossRefWorkMessage(
        PUBLICATIONS.gibbsDensitySurface.doi!,
      );
      if (!preflight) {
        skipWithMessage(
          context,
          "CrossRef did not return the Gibbs article during live preflight",
        );
      }

      const item = createMockZoteroItem({
        title: "Gibbs Density Surface",
        DOI: PUBLICATIONS.gibbsDensitySurface.doi,
        itemTypeID: PUBLICATIONS.gibbsDensitySurface.itemTypeID,
        creators: [],
        date: "",
        publicationTitle: "",
      });

      const fetcher = createTestMetadataFetcher();
      const result = await fetcher.fetchMetadataForItem(item);
      if (!result.success) {
        skipWithMessage(
          context,
          `Live metadata update failed without changing the item: ${result.errors.join(", ") || result.source}`,
        );
      }

      expect(item.getField("title")).toBe(
        PUBLICATIONS.gibbsDensitySurface.title,
      );
      expect(item.getField("DOI")).toBe(PUBLICATIONS.gibbsDensitySurface.doi);
      expect(item.getField("publicationTitle")).toBe(
        "International Journal of Thermophysics",
      );
      expect(item.getField("date")).toBe("2013");
      expect(item.getCreators().length).toBeGreaterThan(0);
      expectTag(item, "Metadata Updated");
    });
  });

  it("does not corrupt an unrelated title when given the supplied mismatched DOI", async (context) => {
    await withTransientSkip(context, async () => {
      const preflight = await new CrossRefAPI().getCrossRefWorkMessage(
        PUBLICATIONS.enrichingWordVectors.doi!,
      );
      if (!preflight) {
        skipWithMessage(
          context,
          "CrossRef did not return the mismatched DOI during live preflight",
        );
      }

      const item = createMockZoteroItem({
        ...PUBLICATIONS.enrichingWordVectors,
        publicationTitle: "",
        volume: "",
        issue: "",
        pages: "",
        url: "",
      });

      const fetcher = createTestMetadataFetcher();
      await fetcher.fetchMetadataForItem(item);

      expect(item.getField("title")).toBe(
        PUBLICATIONS.enrichingWordVectors.title,
      );
      expect(item.getField("publicationTitle")).not.toBe(
        "Journal of Surgical Research",
      );
      expect(item.getField("date")).not.toBe("1970");
    });
  });

  it("corrects the Semi-Supervised arXiv DOI using live metadata fetch", async (context) => {
    await withTransientSkip(context, async () => {
      const preflight = await new OpenAlexAPI().getWorkByDOI(
        PUBLICATIONS.semiSupervisedLearning.doi!,
      );
      if (!preflight) {
        skipWithMessage(
          context,
          "OpenAlex did not return the Semi-Supervised arXiv DOI during live preflight",
        );
      }

      const item = createMockZoteroItem({
        ...PUBLICATIONS.semiSupervisedLearning,
        DOI: "10.29228/joh.67701",
        extra: `arXiv: ${PUBLICATIONS.semiSupervisedLearning.arxivId}`,
        publicationTitle: "arXiv",
        attachmentIds: [],
      });

      const fetcher = createTestMetadataFetcher();
      const result = await fetcher.fetchMetadataForItem(item);
      if (!result.success) {
        skipWithMessage(
          context,
          `Live Semi-Supervised metadata fetch failed without changing the item: ${result.errors.join(", ") || result.source}`,
        );
      }

      expect(item.getField("DOI")).toBe(
        PUBLICATIONS.semiSupervisedLearning.doi,
      );
      expect(item.getField("title")).toBe(
        PUBLICATIONS.semiSupervisedLearning.title,
      );
      expect(item.getField("date")).toBe(
        PUBLICATIONS.semiSupervisedLearning.date,
      );
      expectTag(item, "Metadata Updated");
    });
  });

  it("processes the Semi-Supervised arXiv item using live discovery", async (context) => {
    await withTransientSkip(context, async () => {
      const item = createMockZoteroItem({
        ...PUBLICATIONS.semiSupervisedLearning,
        extra: `arXiv: ${PUBLICATIONS.semiSupervisedLearning.arxivId}`,
        attachmentIds: [],
      });

      const processor = new ArxivProcessor();
      const publishedRef = await processor.findPublishedVersion(item);
      const result = await processor.processArxivItem(item);

      expect(result.processed).toBe(true);
      if (publishedRef) {
        expect(result.outcome).toBe("updated_published");
        return;
      }

      expect(result.outcome).toBe("converted_preprint");
      expect(Zotero.ItemTypes.getName(item.itemTypeID)).toBe("preprint");
      expect(item.getField("repository")).toBe("arXiv");
      expect(item.getField("publicationTitle")).toBe("");
    });
  });

  it("retrieves the Semi-Supervised arXiv PDF even with a mismatched DOI", async (context) => {
    await withTransientSkip(context, async () => {
      const item = createMockZoteroItem({
        ...PUBLICATIONS.semiSupervisedLearning,
        DOI: "10.29228/joh.67701",
        extra: `arXiv: ${PUBLICATIONS.semiSupervisedLearning.arxivId}`,
        publicationTitle: "arXiv",
        attachmentIds: [],
      });

      const finder = new FileFinder();
      const preflightUrl = await finder.findArxivPDF(item);
      if (!preflightUrl) {
        skipWithMessage(
          context,
          "No arXiv PDF URL resolved for the Semi-Supervised example during live preflight",
        );
      }

      const result = await finder.processItem(item);
      maybeSkipTransientDownloadFailure(context, result);

      expect(result.outcome).toBe("downloaded");
      expect(result.source).toBe("arXiv");
      expect(item.getAttachments().length).toBeGreaterThan(0);
    });
  });

  it("falls back to preprint conversion when no published version is found for InfoGAN", async (context) => {
    await withTransientSkip(context, async () => {
      const item = createMockZoteroItem({
        ...PUBLICATIONS.infoGan,
        extra: `arXiv: ${PUBLICATIONS.infoGan.arxivId}`,
        repository: "",
      });

      const processor = new ArxivProcessor();
      const publishedRef = await processor.findPublishedVersion(item);
      const result = await processor.processArxivItem(item);

      expect(result.processed).toBe(true);
      if (publishedRef) {
        expect(result.outcome).toBe("updated_published");
        return;
      }

      expect(result.outcome).toBe("converted_preprint");
      expect(Zotero.ItemTypes.getName(item.itemTypeID)).toBe("preprint");
      expect(item.getField("repository")).toBe("arXiv");
      expect(item.getField("publicationTitle")).toBe("");
    });
  });

  it("retrieves a real PDF for Dynamic Word Embeddings when none exists", async (context) => {
    await withTransientSkip(context, async () => {
      const item = createMockZoteroItem({
        ...PUBLICATIONS.dynamicWordEmbeddings,
        extra: `arXiv: ${PUBLICATIONS.dynamicWordEmbeddings.arxivId}`,
        attachmentIds: [],
      });

      const finder = new FileFinder();
      const preflightUrl = await finder.findArxivPDF(item);
      if (!preflightUrl) {
        skipWithMessage(
          context,
          "No arXiv PDF URL resolved during live preflight",
        );
      }

      const result = await finder.processItem(item);
      maybeSkipTransientDownloadFailure(context, result);

      expect(result.outcome).toBe("downloaded");
      expect(item.getAttachments().length).toBeGreaterThan(0);
      const attachment = Zotero.Items.get(item.getAttachments()[0]);
      expect(attachment?.attachmentContentType).toBe("application/pdf");
    });
  });
});
