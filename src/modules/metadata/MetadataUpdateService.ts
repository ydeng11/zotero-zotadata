import { ErrorManager, ErrorType } from "@/shared/core";
import { OpenAlexAPI } from "@/features/metadata/apis";
import { calculateStringSimilarity } from "@/utils/similarity";
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
    if (metadataTitle && (!currentTitle || currentTitle.length < 10)) {
      item.setField("title", metadataTitle);
      changes.push(`Updated title: ${metadataTitle}`);
    }

    if (metadata.author?.length && item.getCreators().length === 0) {
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

  shouldUpdateTitle(currentTitle: string, newTitle: string): boolean {
    if (!currentTitle) return true;
    if (!newTitle) return false;

    const similarity = calculateStringSimilarity(
      currentTitle.toLowerCase(),
      newTitle.toLowerCase(),
    );

    return similarity < 0.8 && newTitle.length > currentTitle.length;
  }

  shouldUpdateAuthors(item: Zotero.Item, newAuthors: string[]): boolean {
    const currentAuthors = extractAuthorsFromItem(item);

    if (currentAuthors.length === 0) return true;
    if (newAuthors.length === 0) return false;

    if (currentAuthors.length > newAuthors.length * 1.5) return false;

    return newAuthors.length > currentAuthors.length;
  }

  private applyCrossRefAuthors(
    item: Zotero.Item,
    authors: Array<{ given?: string; family: string }>,
  ): void {
    const editableItem = item as Zotero.Item & {
      numCreators?: () => number;
      setCreator?: (
        index: number,
        creator: {
          creatorTypeID: number;
          firstName: string;
          lastName: string;
        },
      ) => void;
    };

    if (typeof editableItem.setCreator === "function") {
      const creatorTypeID = (
        Zotero as typeof Zotero & {
          CreatorTypes?: { getPrimaryIDForType: (typeID: number) => number };
        }
      ).CreatorTypes?.getPrimaryIDForType(item.itemTypeID);

      authors.forEach((author) => {
        editableItem.setCreator?.(editableItem.numCreators?.() ?? 0, {
          creatorTypeID: creatorTypeID ?? 1,
          firstName: author.given ?? "",
          lastName: author.family,
        });
      });
      return;
    }

    item.setCreators(
      authors.map((author) => ({
        creatorType: "author",
        firstName: author.given ?? "",
        lastName: author.family,
      })),
    );
  }
}
