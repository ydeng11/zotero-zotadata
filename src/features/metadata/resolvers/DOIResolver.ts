import { IdentifierResolver } from "./IdentifierResolver";
import { parseDoiFromExtra } from "@/utils/itemSearchQuery";

export class DOIResolver extends IdentifierResolver {
  extract(item: Zotero.Item): string | null {
    const doiField = item.getField("DOI");
    if (doiField) {
      return this.cleanDOI(doiField);
    }

    const url = item.getField("url");
    if (url) {
      const match = url.match(/10\.\d{4,}\/[^\s?#]+/);
      if (match) {
        return this.cleanDOI(match[0]);
      }
    }

    const extra = item.getField("extra");
    if (extra) {
      return parseDoiFromExtra(extra) ?? null;
    }

    return null;
  }

  async discover(item: Zotero.Item): Promise<string | null> {
    const query = this.buildSearchQuery(item);
    if (!query.title) return null;

    // API integration pending - requires config for API clients
    return null;
  }
}
