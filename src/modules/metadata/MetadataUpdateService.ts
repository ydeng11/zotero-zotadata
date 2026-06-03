import { ErrorManager } from "@/shared/core";
import { OpenAlexAPI } from "@/features/metadata/apis";
import { applyAuthorsToItem, isAuthorCreator } from "@/utils/itemFields";
import { shouldRewriteAuthorsForMetadata } from "@/utils/authorValidation";
import { isExactTitleMatch } from "@/utils/similarity";
import type { CrossRefWork } from "@/shared/core/types";

export class MetadataUpdateService {
  private errorManager: ErrorManager;
  private openAlexAPI: OpenAlexAPI;

  constructor() {
    this.errorManager = new ErrorManager();
    this.openAlexAPI = new OpenAlexAPI();
  }

  private debug(message: string): void {
    if (typeof Zotero !== "undefined" && Zotero.log) {
      Zotero.log(`Zotadata MetadataUpdateService: ${message}`);
    }
  }

  async updateItemWithMetadata(
    item: Zotero.Item,
    metadata: CrossRefWork,
  ): Promise<string[]> {
    const changes: string[] = [];
    const currentTitle = String(item.getField("title") ?? "");
    const metadataTitle = Array.isArray(metadata.title)
      ? metadata.title[0]
      : metadata.title;
    const metadataAuthors = this.formatCrossRefAuthors(metadata.author ?? []);

    this.debug(
      `Source: CrossRef — updating item ${item.id} from DOI ${metadata.DOI}`,
    );

    if (metadataTitle && this.shouldUpdateTitle(currentTitle, metadataTitle)) {
      this.debug(`Writing title "${metadataTitle}" (was: "${currentTitle}")`);
      item.setField("title", metadataTitle);
      changes.push(`Updated title: ${metadataTitle}`);
    }

    if (
      metadata.author?.length &&
      shouldRewriteAuthorsForMetadata(item, {
        title: metadataTitle,
        authors: metadataAuthors,
        year: metadata.published?.["date-parts"]?.[0]?.[0],
        doi: metadata.DOI,
        source: "CrossRef",
        confidence: 1,
      })
    ) {
      this.debug(`Writing ${metadata.author.length} authors from CrossRef`);
      this.applyCrossRefAuthors(item, metadata.author);
      changes.push(`Updated authors: ${metadata.author.length}`);
    }

    if (!this.shouldApplyCrossRefFields(currentTitle, metadataTitle)) {
      this.debug(
        `Title mismatch — skipping CrossRef fields (current="${currentTitle}", metadata="${metadataTitle}")`,
      );
      await item.saveTx();
      return changes;
    }

    const containerTitle = metadata["container-title"]?.[0];
    if (containerTitle) {
      this.debug(`Writing publicationTitle "${containerTitle}"`);
      item.setField("publicationTitle", containerTitle);
      changes.push(`Updated publication title: ${containerTitle}`);
    }

    const year = metadata.published?.["date-parts"]?.[0]?.[0];
    if (year) {
      this.debug(`Writing date ${year}`);
      item.setField("date", String(year));
      changes.push(`Updated date: ${year}`);
    }

    if (metadata.volume) {
      this.debug(`Writing volume ${metadata.volume}`);
      item.setField("volume", metadata.volume);
      changes.push(`Updated volume: ${metadata.volume}`);
    }
    if (metadata.issue) {
      this.debug(`Writing issue ${metadata.issue}`);
      item.setField("issue", metadata.issue);
      changes.push(`Updated issue: ${metadata.issue}`);
    }
    if (metadata.page) {
      this.debug(`Writing pages ${metadata.page}`);
      item.setField("pages", metadata.page);
      changes.push(`Updated pages: ${metadata.page}`);
    }
    if (metadata.URL && !String(item.getField("url") ?? "").trim()) {
      this.debug(`Writing URL ${metadata.URL}`);
      item.setField("url", metadata.URL);
      changes.push(`Updated URL: ${metadata.URL}`);
    }

    this.debug(
      `CrossRef update done — ${changes.length} change(s) for item ${item.id}`,
    );
    await item.saveTx();
    return changes;
  }

  async supplementDOIMetadata(
    item: Zotero.Item,
    doi: string,
  ): Promise<string[]> {
    const changes: string[] = [];

    this.debug(
      `Source: OpenAlex — supplementing item ${item.id} for DOI ${doi}`,
    );
    const openAlexResult = await this.openAlexAPI.getWorkByDOI(doi);
    if (!openAlexResult) {
      this.debug(`OpenAlex returned no result for DOI ${doi}`);
      return changes;
    }

    // Update title first so the subsequent author check sees the new title.
    const currentTitle = String(item.getField("title") ?? "").trim();
    if (
      openAlexResult.title &&
      (!currentTitle ||
        this.shouldUpdateTitle(currentTitle, openAlexResult.title))
    ) {
      this.debug(
        `Writing title "${openAlexResult.title}" (was: "${currentTitle}")`,
      );
      item.setField("title", openAlexResult.title);
      changes.push(`Updated title: ${openAlexResult.title}`);
    }

    if (
      openAlexResult.authors?.length &&
      shouldRewriteAuthorsForMetadata(item, {
        title: openAlexResult.title,
        authors: openAlexResult.authors,
        year: openAlexResult.year,
        doi,
        source: "OpenAlex",
        confidence: 1,
      })
    ) {
      this.debug(
        `Writing ${openAlexResult.authors.length} authors from OpenAlex`,
      );
      applyAuthorsToItem(item, openAlexResult.authors);
      changes.push(`Updated authors: ${openAlexResult.authors.join(", ")}`);
    }

    const currentDate = String(item.getField("date") ?? "").trim();
    if (!currentDate && openAlexResult.year) {
      this.debug(`Writing date ${openAlexResult.year}`);
      item.setField("date", String(openAlexResult.year));
      changes.push(`Updated date: ${openAlexResult.year}`);
    }

    if (changes.length > 0) {
      this.debug(
        `OpenAlex supplement done — ${changes.length} change(s) for item ${item.id}`,
      );
      await item.saveTx();
    } else {
      this.debug(`OpenAlex supplement — no new data for item ${item.id}`);
    }

    return changes;
  }

  shouldUpdateTitle(currentTitle: string, _newTitle: string): boolean {
    if (!currentTitle) return true;
    return false;
  }

  private shouldApplyCrossRefFields(
    currentTitle: string,
    metadataTitle: string | undefined,
  ): boolean {
    const existingTitle = currentTitle.trim();
    const incomingTitle = metadataTitle?.trim() ?? "";

    if (!existingTitle || !incomingTitle) {
      return true;
    }

    return isExactTitleMatch(existingTitle, incomingTitle);
  }

  private applyCrossRefAuthors(
    item: Zotero.Item,
    authors: Array<{ given?: string; family: string }>,
  ): void {
    const existingCreators = item.getCreators();
    const nonAuthors = existingCreators.filter(
      (creator) => !isAuthorCreator(creator),
    );

    const newAuthors = authors.map((author) => ({
      creatorType: "author" as const,
      firstName: author.given ?? "",
      lastName: author.family,
    }));

    item.setCreators([...newAuthors, ...nonAuthors]);
  }

  private formatCrossRefAuthors(
    authors: Array<{ given?: string; family: string }>,
  ): string[] {
    return authors.map((author) =>
      [author.given, author.family].filter(Boolean).join(" ").trim(),
    );
  }
}
