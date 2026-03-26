import type { SearchQuery } from '@/shared/core/types';

export abstract class IdentifierResolver {
  abstract extract(item: Zotero.Item): string | null;
  abstract discover(item: Zotero.Item): Promise<string | null>;

  protected cleanDOI(doi: string): string {
    return doi
      .replace(/^(https?:\/\/)?(dx\.)?doi\.org\//, '')
      .replace(/^doi:/, '')
      .trim()
      .toLowerCase();
  }

  protected cleanISBN(isbn: string): string {
    return isbn.replace(/[-\s]/g, '').toUpperCase();
  }

  protected buildSearchQuery(item: Zotero.Item): SearchQuery {
    const title = item.getField('title') || undefined;
    const date = item.getField('date');
    const year = date ? this.extractYear(date) : undefined;
    const creators = item.getCreators();
    const authors = creators
      .filter(c => c.creatorType === 'author')
      .map(c => c.lastName || c.name || '')
      .filter(Boolean);

    return { title, year, authors: authors.length > 0 ? authors : undefined };
  }

  protected extractYear(dateStr: string): number | undefined {
    const match = dateStr.match(/\d{4}/);
    return match ? parseInt(match[0], 10) : undefined;
  }
}