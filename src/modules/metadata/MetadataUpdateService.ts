import { ErrorManager } from "@/shared/core";
import { OpenAlexAPI } from "@/features/metadata/apis";
import { isExactTitleMatch } from "@/utils/similarity";
import { applyAuthorsToItem, extractAuthorsFromItem } from "@/utils/itemFields";
import type { CrossRefWork } from "@/shared/core/types";

export class MetadataUpdateService {
  private errorManager: ErrorManager;
  private openAlexAPI: OpenAlexAPI;

  constructor() {
    this.errorManager = new ErrorManager();
    this.openAlexAPI = new OpenAlexAPI();
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
    if (metadataTitle && this.shouldUpdateTitle(currentTitle, metadataTitle)) {
      item.setField("title", metadataTitle);
      changes.push(`Updated title: ${metadataTitle}`);
    }

    if (
      metadata.author?.length &&
      this.shouldUpdateCrossRefAuthors(item, currentTitle, metadataTitle)
    ) {
      this.applyCrossRefAuthors(item, metadata.author);
      changes.push(`Updated authors: ${metadata.author.length}`);
    }

    const containerTitle = metadata["container-title"]?.[0];
    if (containerTitle) {
      item.setField("publicationTitle", containerTitle);
      changes.push(`Updated publication title: ${containerTitle}`);
    }

    const year = metadata.published?.["date-parts"]?.[0]?.[0];
    if (year) {
      item.setField("date", String(year));
      changes.push(`Updated date: ${year}`);
    }

    if (metadata.volume) {
      item.setField("volume", metadata.volume);
      changes.push(`Updated volume: ${metadata.volume}`);
    }
    if (metadata.issue) {
      item.setField("issue", metadata.issue);
      changes.push(`Updated issue: ${metadata.issue}`);
    }
    if (metadata.page) {
      item.setField("pages", metadata.page);
      changes.push(`Updated pages: ${metadata.page}`);
    }
    if (metadata.URL && !String(item.getField("url") ?? "").trim()) {
      item.setField("url", metadata.URL);
      changes.push(`Updated URL: ${metadata.URL}`);
    }

    await item.saveTx();
    return changes;
  }

  async supplementDOIMetadata(
    item: Zotero.Item,
    doi: string,
  ): Promise<string[]> {
    const changes: string[] = [];
    const openAlexResult = await this.openAlexAPI.getWorkByDOI(doi);
    if (!openAlexResult) {
      return changes;
    }

    if (
      openAlexResult.authors?.length &&
      this.shouldUpdateAuthors(item, openAlexResult.authors)
    ) {
      applyAuthorsToItem(item, openAlexResult.authors);
      changes.push(`Updated authors: ${openAlexResult.authors.join(", ")}`);
    }

    const currentTitle = String(item.getField("title") ?? "").trim();
    if (
      openAlexResult.title &&
      (!currentTitle ||
        this.shouldUpdateTitle(currentTitle, openAlexResult.title))
    ) {
      item.setField("title", openAlexResult.title);
      changes.push(`Updated title: ${openAlexResult.title}`);
    }

    const currentDate = String(item.getField("date") ?? "").trim();
    if (!currentDate && openAlexResult.year) {
      item.setField("date", String(openAlexResult.year));
      changes.push(`Updated date: ${openAlexResult.year}`);
    }

    if (changes.length > 0) {
      await item.saveTx();
    }

    return changes;
  }

  shouldUpdateTitle(currentTitle: string, _newTitle: string): boolean {
    if (!currentTitle) return true;
    return false;
  }

  shouldUpdateAuthors(item: Zotero.Item, newAuthors: string[]): boolean {
    const currentAuthors = extractAuthorsFromItem(item);

    if (currentAuthors.length === 0) return true;
    if (newAuthors.length === 0) return false;

    if (currentAuthors.length > newAuthors.length * 1.5) return false;

    return newAuthors.length > currentAuthors.length;
  }

  private shouldUpdateCrossRefAuthors(
    item: Zotero.Item,
    currentTitle: string,
    metadataTitle?: string,
  ): boolean {
    const currentAuthors = extractAuthorsFromItem(item);
    if (currentAuthors.length === 0) return true;
    if (!currentTitle.trim()) return true;
    if (!metadataTitle) return false;

    return isExactTitleMatch(currentTitle, metadataTitle);
  }

  private applyCrossRefAuthors(
    item: Zotero.Item,
    authors: Array<{ given?: string; family: string }>,
  ): void {
    const existingCreators = item.getCreators();
    const nonAuthors = existingCreators.filter(
      (creator) => creator.creatorType !== "author",
    );

    const newAuthors = authors.map((author) => ({
      creatorType: "author" as const,
      firstName: author.given ?? "",
      lastName: author.family,
    }));

    item.setCreators([...newAuthors, ...nonAuthors]);
  }
}
