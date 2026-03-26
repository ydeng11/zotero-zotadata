import { IdentifierResolver } from './IdentifierResolver';

export class DOIResolver extends IdentifierResolver {

  /**
   * Extract DOI from item fields
   */
  extract(item: Zotero.Item): string | null {
    // Try DOI field first
    const doiField = item.getField('DOI');
    if (doiField) {
      return this.cleanDOI(doiField);
    }

    // Try URL field
    const url = item.getField('url');
    if (url) {
      const match = url.match(/10\.\d{4,}\/[^\s]+/);
      if (match) {
        return this.cleanDOI(match[0]);
      }
    }

    // Try extra field
    const extra = item.getField('extra');
    if (extra) {
      const match = extra.match(/DOI[:\-\s]*(10\.\d{4,}\/[^\s]+)/i);
      if (match) {
        return this.cleanDOI(match[1]);
      }
    }

    return null;
  }

  /**
   * Discover DOI via API searches
   */
  async discover(item: Zotero.Item): Promise<string | null> {
    const query = this.buildSearchQuery(item);
    if (!query.title) return null;

    // Note: API integration would go here
    // For now, return null as APIs need to be instantiated with config
    return null;
  }
}